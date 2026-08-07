---
name: "am"
description: >-
  Control Apple Music and read the user's listening history from the terminal.
  Use when asked to recommend music, build a playlist, find what to listen to,
  play or pause something, or answer questions about what the user listens to
  ("make me a playlist", "what should I listen to", "play that playlist",
  "what am I into lately").
---

# am

`am` gives you Apple Music's catalog, the user's library, and playback control
as plain commands. It is a set of primitives, **not a recommender** — the taste
judgment is yours. `am taste` hands you the evidence; you decide what to
suggest, then `am playlist.create` writes it back.

Do not use `am` to reason about music you cannot verify exists: every track you
put in a playlist must come from a real `am search` result.

## Discover Capabilities First

```bash
am @schema              # full typed spec
```

## Command Reference

| Command                             | What it does                       | When to use                       |
| ----------------------------------- | ---------------------------------- | --------------------------------- |
| `am taste`                          | Play counts by artist and track    | Before recommending anything      |
| `am search`                         | Catalog search, returns IDs + ISRC | To resolve any track you'll write |
| `am playlist.create` / `.add`       | Write a playlist from catalog IDs  | To deliver a recommendation       |
| `am playlist.list` / `.tracks`      | Read existing playlists            | To extend or inspect              |
| `am play` / `am now` / `am control` | Local Music.app playback           | To actually start listening       |
| `am auth.status` / `.refresh`       | Credentials                        | Only when something 401s          |

## Core Workflow

Recommending music is always the same three steps:

```bash
# 1. Read the evidence — this is the signal Apple's own recommender ignores
am taste "{ artists: 20, tracks: 25 }"

# 2. Resolve every candidate. Check the artist field before trusting a hit:
#    title-only matches surface covers, remixes and piano tributes.
am search "{ term: 'nujabes aruarian dance', limit: 5 }"

# 3. Write it, then play it
am playlist.create "{ name: '...', tracks: ['1721843001', '1078914488'] }"
am play "am 选曲"
```

`playlist.create` seeds tracks in the same request — there is no separate
"add to library first" step.

## Reading `am taste`

Look for _clusters_, not a single average. A library that splits into several
non-overlapping groups is exactly where collaborative filtering fails and you
add value: recommend into each cluster separately rather than to their
intersection, which is where a generic recommender lands.

## Anti-Patterns

| Don't do this                                       | Do this instead                                 | Why                                                                      |
| --------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------ |
| Write a track from a title-only search hit          | Check `artist` on the result first              | Covers and remixes share titles; the wrong edition lands silently        |
| Read an empty `results: []` as "not on Apple Music" | Check `$hints`, and retry with a different term | Regional catalogs differ — a track can be absent in one storefront only  |
| Run `auth.refresh` preemptively                     | Just run the command; refresh is automatic      | Credentials refresh on expiry and on 401                                 |
| Retry immediately after `rate_limited`              | Wait — the window is rolling and ~60 minutes    | Retrying extends the window rather than clearing it                      |
| Recommend from your own memory of the user's taste  | Run `am taste` first                            | Play counts contradict self-reported taste more often than they confirm  |
| Ask the user to open a browser for auth             | Just run the command                            | `am` drives Aside itself; a browser is only needed if the session is out |

## Requirements

macOS with Music.app and an Apple Music subscription. Credentials come from
[Aside](https://aside.com)'s logged-in Chrome profile and live in the login
keychain; `am` fetches them on demand. The only unautomatable failure is a
signed-out Apple session — `am` reports `signed_out` and tells the user where
to sign in.

## Self-Improvement

When you encounter friction — a command that doesn't behave as documented, a
misleading instruction in this skill, or confusing output — file a GitHub
issue against `ethan-huo/am` instead of silently working around it.
