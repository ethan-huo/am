# am

Apple Music's catalog, the user's library and Music.app playback as plain commands. It is a set of primitives, not a recommender: taste judgment is yours. `am taste` is the evidence, `am playlist.create` writes your answer back. Needs macOS, Music.app and a subscription; credentials come from the Aside browser's signed-in profile and refresh on their own.

Read the section for your task, then only that slice: `am @schema .playlist`, or several at once with `am @schema '.{taste,search}'`.

## Recommending — .{taste,search,playlist}

- Start from `am taste`, never from your memory of the user's taste: play counts contradict self-reported taste more often than they confirm it. Look for clusters, not one average. A library that splits into non-overlapping groups is where collaborative filtering fails and you add value, so recommend into each cluster rather than to their intersection.
- Every track you write must come from a real `am search` result; don't reason about music you cannot verify exists. Copy the catalog ID verbatim from the output: IDs have no checksum and a wrong one fails as an opaque `500 Upstream Service Error` (an ID that doesn't exist returns 500, not 404, so it means a typo and not an outage).
- Check `artist` on the hit before trusting it. Title-only matches surface covers, remixes and piano tributes, and the wrong edition lands silently.
- Empty `results: []` is not "not on Apple Music": regional catalogs differ. Read `$hints` and retry with another term.
- `playlist.create` seeds its tracks in the same request, so there is no "add to library first" step.

## Playback — .{play,now,control}

Local Music.app only: Apple Music has no remote-playback endpoint.

## Credentials — .auth

Run the command you wanted; refresh is automatic on expiry and on 401, so don't run `auth.refresh` preemptively, and don't ask the user to open a browser (`am` drives Aside itself). Only a signed-out Apple session can't be automated: `am` reports `signed_out` and says where to sign in.

## Rate limits

After `rate_limited`, wait: the window is rolling and about 60 minutes, and retrying extends it.

## Friction

When a command misbehaves against this guide or its output misleads, file a GitHub issue on `ethan-huo/am` instead of silently working around it.
