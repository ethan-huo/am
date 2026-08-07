import { domainError } from "argc";

import { getTokens, refresh, type Tokens } from "./auth.ts";

const BASE = "https://amp-api.music.apple.com";

type RequestOptions = {
  method?: string;
  body?: unknown;
  query?: Record<string, string | number | undefined>;
};

async function once(tokens: Tokens, path: string, opts: RequestOptions): Promise<Response> {
  const url = new URL(path, BASE);
  for (const [k, val] of Object.entries(opts.query ?? {})) {
    if (val !== undefined) url.searchParams.set(k, String(val));
  }
  return fetch(url, {
    method: opts.method ?? "GET",
    headers: {
      Authorization: `Bearer ${tokens.devToken}`,
      "media-user-token": tokens.userToken,
      // amp-api is the web player's own backend and rejects requests without a
      // music.apple.com origin — in-browser calls get these for free, so they
      // only surface once the same token is used from outside a page.
      Origin: "https://music.apple.com",
      Referer: "https://music.apple.com/",
      ...(opts.body ? { "Content-Type": "application/json" } : {}),
    },
    ...(opts.body ? { body: JSON.stringify(opts.body) } : {}),
  });
}

/**
 * Call amp-api, transparently refreshing credentials once on 401/403.
 *
 * The user token is opaque, so its lifetime is unknowable up front — an auth
 * failure is the only signal that it died, and it invalidates both tokens.
 */
export async function call<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  let tokens = await getTokens();
  let res = await once(tokens, path, opts);

  if (res.status === 401 || res.status === 403) {
    tokens = await refresh();
    res = await once(tokens, path, opts);
  }

  // Shared public-token quota: a rolling ~60min window with no Retry-After.
  // Surfacing this explicitly matters — an empty result set would otherwise
  // read as "no such song" and send the caller chasing a phantom bug.
  if (res.status === 429) {
    throw domainError("rate_limited", "Apple Music rate limit hit (shared web-player quota)", {
      hint: "The window is rolling and ~60 minutes long; retrying sooner extends it.",
    });
  }

  if (!res.ok) {
    const body = (await res.text()).slice(0, 300);
    throw domainError("api_error", `Apple Music API returned ${res.status}`, { body });
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export type Song = {
  id: string;
  name: string;
  artist: string;
  album: string;
  isrc?: string;
  durationMs?: number;
  url?: string;
};

type CatalogSongResource = {
  id: string;
  attributes: {
    name: string;
    artistName: string;
    albumName: string;
    isrc?: string;
    durationInMillis?: number;
    url?: string;
  };
};

export async function search(term: string, limit: number, storefront: string): Promise<Song[]> {
  const data = await call<{
    results: { songs?: { data: CatalogSongResource[] } };
  }>(`/v1/catalog/${storefront}/search`, {
    query: { term, types: "songs", limit },
  });

  return (data.results.songs?.data ?? []).map((s) => ({
    id: s.id,
    name: s.attributes.name,
    artist: s.attributes.artistName,
    album: s.attributes.albumName,
    isrc: s.attributes.isrc,
    durationMs: s.attributes.durationInMillis,
    url: s.attributes.url,
  }));
}

export type Playlist = { id: string; name: string; trackCount?: number };

export async function listPlaylists(limit: number): Promise<Playlist[]> {
  const data = await call<{
    data: { id: string; attributes: { name: string } }[];
  }>("/v1/me/library/playlists", { query: { limit } });
  return data.data.map((p) => ({ id: p.id, name: p.attributes.name }));
}

/**
 * Create a playlist and seed it in one request.
 *
 * Catalog song IDs go straight into `relationships.tracks` — the documented
 * "add to library first, then to the playlist" two-step is unnecessary here
 * (verified 2026-08-06: 201 with all 13 tracks attached).
 */
export async function createPlaylist(
  name: string,
  tracks: string[],
  description?: string,
): Promise<Playlist> {
  const data = await call<{
    data: { id: string; attributes: { name: string } }[];
  }>("/v1/me/library/playlists", {
    method: "POST",
    body: {
      attributes: { name, ...(description ? { description } : {}) },
      relationships: { tracks: { data: tracks.map((id) => ({ id, type: "songs" })) } },
    },
  });
  const created = data.data[0];
  if (!created)
    throw domainError("create_failed", "Apple Music accepted the request but returned no playlist");
  return { id: created.id, name: created.attributes.name };
}

export async function addTracks(playlistId: string, tracks: string[]): Promise<void> {
  await call(`/v1/me/library/playlists/${playlistId}/tracks`, {
    method: "POST",
    body: { data: tracks.map((id) => ({ id, type: "songs" })) },
  });
}

export async function playlistTracks(playlistId: string): Promise<Song[]> {
  const data = await call<{ data: CatalogSongResource[] }>(
    `/v1/me/library/playlists/${playlistId}/tracks`,
  );
  return data.data.map((t) => ({
    id: t.id,
    name: t.attributes.name,
    artist: t.attributes.artistName,
    album: t.attributes.albumName,
  }));
}
