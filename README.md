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

Requires macOS, an Apple Music subscription, and
[Aside](https://aside.com) signed in to Apple Music. Credentials are read on
demand and stored in your login keychain — there is no login step to run.

## Usage

`am @schema` prints the full typed command surface. For agents, install the
skill in `skills/am/`.

## License

MIT
