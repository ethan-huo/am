# Backlog

Known tails accepted during the initial build (2026-08-07).

## Hardcoded values in `scripts/refresh-token.js`

- `AGENT_NAME = "Claude Code"` names the Chrome tab group. Called from another
  harness, the group label is wrong. Harmless but sloppy — the tab is transient
  and removed in a `finally`.
- Navigation goes to `music.apple.com/cn/browse`. The **storefront itself is
  read from MusicKit**, so this doesn't corrupt anything, but a non-CN account
  takes a redirect it shouldn't need.

Fix both by passing values in rather than baking them into the script text.

## Missing commands (deliberately out of v1 scope)

`playlist.delete` / `.rename`, and the whole `discover` surface
(recommendations, charts, similar artists, radio stations). The discover
endpoints are Apple's own recommender — the thing this tool exists to route
around — so they are low priority. Deletion is the more likely first ask, since
nothing in `am` can currently clean up a playlist it created.

## `taste` ignores ratings and loved status

Only `playedCount` is aggregated. Music.app also exposes 1–5 star ratings and
loved/disliked, which the API cannot see at all, and which are a stronger
signal than play count because they're deliberate. Worth adding once someone
actually rates tracks — dio's library is currently rating-sparse.

## `taste` has no recency dimension

Play counts are lifetime totals, so a phase someone moved on from years ago
outranks what they're into now. `playedDate` is available on every track and
would allow a recency-weighted view. This is the most likely source of
mediocre recommendations from an otherwise correct pipeline.
