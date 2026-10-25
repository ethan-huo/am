// Runs inside `aside repl`. Opens a music.apple.com tab in the user's logged-in
// Chrome profile, reads MusicKit's tokens, and prints them as JSON.
//
// This is the ONLY step that needs a browser. Everything else in `am` is plain HTTP.
//
// Tab lifecycle must go through openTab()/closeTab(): Aside exposes chrome.tabs as
// inspection-only, so creating or navigating a tab through it is a hard permission
// error, not a silent no-op.

page = await openTab("https://music.apple.com/cn/browse");

let result = null;
try {
  // MusicKit boots asynchronously — poll instead of guessing a sleep duration.
  for (let i = 0; i < 30 && !result; i++) {
    result = await page.evaluate(() => {
      if (typeof MusicKit === "undefined") return null;
      try {
        const mk = MusicKit.getInstance();
        if (!mk || !mk.developerToken) return null;
        const payload = JSON.parse(
          atob(mk.developerToken.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")),
        );
        return {
          devToken: mk.developerToken,
          // Opaque, not a JWT — lifetime is unknown and tied to the Chrome
          // session, so a 401/403 anywhere means refresh both tokens.
          userToken: mk.musicUserToken || null,
          storefront: mk.storefrontId || null,
          authorized: !!mk.isAuthorized,
          exp: payload.exp,
        };
      } catch {
        return null;
      }
    });
    if (!result) await sleep(500);
  }
} finally {
  // Best-effort: a lost ack may still have closed the tab, so never fail on this.
  try {
    await closeTab(page);
  } catch {}
}

if (!result) throw new Error("MusicKit never initialized on music.apple.com");
console.log(`AM_TOKEN_JSON=${JSON.stringify(result)}`);
