// Runs inside `aside repl`. Opens a background music.apple.com tab in the user's
// logged-in Chrome profile, reads MusicKit's tokens, and prints them as JSON.
//
// This is the ONLY step that needs a browser. Everything else in `am` is plain HTTP.
// Validated 2026-08-06: ~1.35s end to end, tab never steals foreground focus.

const AGENT_NAME = "Claude Code";
const marker = `about:blank#am-token-${Date.now()}`;

const groups = await chrome.tabGroups.query({ title: AGENT_NAME });
const existing = groups[0];
const tab = await chrome.tabs.create({
  url: marker,
  active: false,
  ...(existing ? { windowId: existing.windowId } : {}),
});
const groupId = await chrome.tabs.group(
  existing
    ? { tabIds: tab.id, groupId: existing.id }
    : { tabIds: tab.id, createProperties: { windowId: tab.windowId } },
);
if (!existing) await chrome.tabGroups.update(groupId, { title: AGENT_NAME, color: "blue" });

let target;
for (let i = 0; i < 20 && !target; i++) {
  target = (await listBrowserTabs()).find((t) => t.url === marker);
  if (!target) await sleep(50);
}
if (!target) {
  await chrome.tabs.remove(tab.id);
  throw new Error("tab never appeared in browser target list");
}

let result = null;
try {
  await chrome.tabs.update(tab.id, { url: "https://music.apple.com/cn/browse" });
  await attachBrowserTab(target.targetId);

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
    await chrome.tabs.remove(tab.id);
  } catch {}
}

if (!result) throw new Error("MusicKit never initialized on music.apple.com");
console.log(`AM_TOKEN_JSON=${JSON.stringify(result)}`);
