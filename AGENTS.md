# am

An agent-native CLI built with [argc](https://github.com/ethan-huo/argc) on Bun.

- **Building this tool** — use the `argc` skill. It owns the schema design,
  handler, stdout, and release conventions; don't restate them here.
- **Using this tool** — `src/index.md` is the source of truth, served by
  `am @skill`. `skills/am/SKILL.md` is the harness stub (intent matching
  and immediate `@skill` routing; its body is only a fallback).
- **Releasing this tool** — use `.agents/skills/release/SKILL.md`; release is a
  `package.json` version bump pushed to `main`, then the workflow tags and
  publishes.
- **Runtime is Bun** — prefer its native APIs and check the source of truth at
  <https://bun.sh/llms.txt> instead of guessing from memory.

## How this reaches Apple Music

Three surfaces, each chosen because the others can't do the job:

| Surface                            | Used for                  | Why not the others                                          |
| ---------------------------------- | ------------------------- | ----------------------------------------------------------- |
| `amp-api.music.apple.com`          | catalog search, playlists | The public API needs a $99 developer key                    |
| Aside (`scripts/refresh-token.js`) | acquiring credentials     | Tokens only exist inside a signed-in `music.apple.com` page |
| AppleScript / JXA (`src/local.ts`) | playback, play counts     | Apple Music has **no** remote-playback endpoint at all      |

Non-obvious constraints, each one paid for:

- **`Origin: https://music.apple.com` is mandatory.** amp-api returns a bare 401
  without it. In-page calls get it for free, so this only bites from a CLI.
- **`musicUserToken` is opaque**, not a JWT — its lifetime is unknowable, so any
  401/403 means refresh _both_ tokens.
- **AppleScript cannot add catalog tracks** to anything (`add` takes local files
  only), the Up Next queue is not exposed, and only the client that created a
  playlist may edit it. Hence all writes go through amp-api.
- **`open location <music.apple.com URL>` is a trap**: it plays, but reports
  `player state: playing` with no `current track`, so nothing is readable
  afterwards. Play library playlists by name instead.

## Testing

`bun test` is deliberately offline — no Keychain, Aside, or Music.app. Mocking
Apple's API would only test the mock. The real acceptance test is this chain,
run by hand on a Mac with an Apple Music subscription:

```bash
bun run src/main.ts auth.refresh "{}"
bun run src/main.ts search "{ term: 'nujabes aruarian dance', limit: 3 }"
bun run src/main.ts playlist.create "{ name: 'am E2E', tracks: ['1721843001'] }"
bun run src/main.ts play "{ playlist: 'am E2E' }"
bun run src/main.ts now "{}"      # must show artist/name, not a bare state
bun run src/main.ts taste "{}"
```
