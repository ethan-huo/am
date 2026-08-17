# am

Control Apple Music from the terminal — catalog search, playlists, playback,
and your own listening history — without an Apple Developer account.

```bash
am taste "{ artists: 10 }"                    # what you actually listen to
am search "{ term: 'nujabes', limit: 5 }"     # catalog IDs + ISRC
am playlist.create "{ name: 'Late', tracks: ['1721843001'] }"
am play "Late"
```

## Why

Apple Music's recommendations are weak when your taste splits into clusters
that don't overlap — collaborative filtering averages them into mush. `am`
exposes the raw material (`taste`) and the write path (`search` →
`playlist.create`) so an LLM can do the judging instead.

It deliberately ships **no recommendation logic**. That's the caller's job.

## Install

```bash
curl -fsSL https://raw.githubusercontent.com/ethan-huo/am/main/install.sh | sh
```

Requires macOS, an Apple Music subscription, and the Aside browser signed in to
Apple Music. Credentials are read on demand and stored in your login keychain —
there is no login step to run.

**Aside is a hard dependency**, and the only path to credentials: `am` reads
MusicKit's tokens out of a signed-in `music.apple.com` page. Without it, nothing
that touches the catalog or your playlists will work. Local playback and
`am taste` are AppleScript-only and work regardless.

## Usage

`am @schema` prints the full typed command surface. For agents, `am @skill`
prints the usage guide (`src/SKILL.md`); `skills/am/SKILL.md` is the harness
stub.

## License

MIT
