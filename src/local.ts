import { $ } from "bun";
import { domainError } from "argc";

/**
 * Local Music.app control via AppleScript/JXA.
 *
 * Playback lives here rather than in the API because the Apple Music API has no
 * remote-playback endpoint at all (unlike Spotify Connect). Taste data lives
 * here because play counts and ratings exist only in the local library —
 * they are the one signal the catalog API cannot give us.
 */

async function jxa<T>(source: string): Promise<T> {
  const proc = Bun.spawn(["osascript", "-l", "JavaScript", "-e", source], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const [out, err, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (code !== 0) {
    throw domainError("music_app_failed", err.trim() || "osascript failed", {
      hint: "Is Music.app installed and has Terminal been granted Automation access?",
    });
  }
  return JSON.parse(out.trim()) as T;
}

export type TasteArtist = { artist: string; plays: number; tracks: number };
export type TasteTrack = { artist: string; name: string; plays: number };
export type Taste = {
  totalTracks: number;
  totalPlays: number;
  topArtists: TasteArtist[];
  topTracks: TasteTrack[];
};

/**
 * Aggregate the local library's play counts.
 *
 * Reads every track's properties in bulk (one Apple event per property) rather
 * than iterating track objects — the per-object path takes minutes on a library
 * of any size.
 */
export async function taste(limitArtists: number, limitTracks: number): Promise<Taste> {
  const raw = await jxa<{ n: string; a: string; c: number }[]>(`
		const Music = Application('Music');
		const lib = Music.libraryPlaylists[0];
		const names = lib.tracks.name(), artists = lib.tracks.artist(), counts = lib.tracks.playedCount();
		JSON.stringify(names.map((n, i) => ({ n, a: artists[i], c: counts[i] || 0 })));
	`);

  const byArtist = new Map<string, { plays: number; tracks: number }>();
  let totalPlays = 0;
  for (const t of raw) {
    totalPlays += t.c;
    const cur = byArtist.get(t.a) ?? { plays: 0, tracks: 0 };
    cur.plays += t.c;
    cur.tracks += 1;
    byArtist.set(t.a, cur);
  }

  return {
    totalTracks: raw.length,
    totalPlays,
    topArtists: [...byArtist.entries()]
      .map(([artist, v]) => ({ artist, plays: v.plays, tracks: v.tracks }))
      .sort((a, b) => b.plays - a.plays)
      .slice(0, limitArtists),
    topTracks: raw
      .filter((t) => t.c > 0)
      .sort((a, b) => b.c - a.c)
      .slice(0, limitTracks)
      .map((t) => ({ artist: t.a, name: t.n, plays: t.c })),
  };
}

async function applescript(source: string): Promise<string> {
  const proc = Bun.spawn(["osascript", "-e", source], { stdout: "pipe", stderr: "pipe" });
  const [out, err, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (code !== 0) throw domainError("music_app_failed", err.trim() || "osascript failed");
  return out.trim();
}

export async function playlistExists(name: string): Promise<boolean> {
  const out = await applescript(
    `tell application "Music" to return (exists user playlist ${JSON.stringify(name)})`,
  );
  return out === "true";
}

/**
 * Play a library playlist by name, waiting briefly for iCloud to sync it down.
 *
 * A playlist created over the API is not instantly visible to Music.app, so a
 * bare play would fail on a playlist the caller just made.
 */
export async function playPlaylist(name: string, waitMs = 15000): Promise<{ waitedMs: number }> {
  const started = Date.now();
  while (Date.now() - started < waitMs) {
    if (await playlistExists(name)) {
      await applescript(`tell application "Music" to play user playlist ${JSON.stringify(name)}`);
      return { waitedMs: Date.now() - started };
    }
    await Bun.sleep(1000);
  }
  throw domainError("playlist_not_synced", `"${name}" has not synced to Music.app yet`, {
    hint: "iCloud sync is usually seconds; rerun, or play it from the Apple Music web player.",
  });
}

export type NowPlaying = { state: string; artist?: string; name?: string; album?: string };

export async function nowPlaying(): Promise<NowPlaying> {
  const state = await applescript(`tell application "Music" to return player state as string`);
  if (state !== "playing" && state !== "paused") return { state };
  try {
    const out = await applescript(`
			tell application "Music"
				set t to current track
				return (get artist of t) & "\\n" & (get name of t) & "\\n" & (get album of t)
			end tell
		`);
    const [artist, name, album] = out.split("\n");
    return { state, artist, name, album };
  } catch {
    // A streamed URL track reports "playing" but exposes no track object.
    return { state };
  }
}

export async function control(action: "play" | "pause" | "next" | "previous"): Promise<void> {
  const cmd = { play: "play", pause: "pause", next: "next track", previous: "previous track" }[
    action
  ];
  await applescript(`tell application "Music" to ${cmd}`);
}
