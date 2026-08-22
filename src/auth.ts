import { $ } from "bun";
import { domainError } from "@celados/argc";

const SERVICE = "am-apple-music";
const ACCOUNT = "am";

/** Refresh this many seconds before the dev token's own expiry. */
const EXPIRY_MARGIN_S = 60 * 60;

export type Tokens = {
  devToken: string;
  userToken: string;
  storefront: string;
  /** Unix seconds, from the dev token's JWT payload. */
  exp: number;
};

async function readKeychain(): Promise<Tokens | null> {
  try {
    const raw = await $`security find-generic-password -a ${ACCOUNT} -s ${SERVICE} -w`
      .quiet()
      .text();
    return JSON.parse(raw.trim()) as Tokens;
  } catch {
    // Absent or unparseable — either way the caller must refresh.
    return null;
  }
}

async function writeKeychain(tokens: Tokens): Promise<void> {
  // -U updates in place; without it a second write fails on a duplicate item.
  await $`security add-generic-password -U -a ${ACCOUNT} -s ${SERVICE} -w ${JSON.stringify(tokens)}`.quiet();
}

export async function clearKeychain(): Promise<boolean> {
  try {
    await $`security delete-generic-password -a ${ACCOUNT} -s ${SERVICE}`.quiet();
    return true;
  } catch {
    return false;
  }
}

function isExpired(tokens: Tokens): boolean {
  return tokens.exp * 1000 - Date.now() < EXPIRY_MARGIN_S * 1000;
}

/**
 * Drive Aside to read MusicKit's tokens out of the user's logged-in Chrome
 * profile. This is the only browser-dependent step in the whole CLI.
 */
export async function refresh(): Promise<Tokens> {
  const script = new URL("../scripts/refresh-token.js", import.meta.url).pathname;
  const source = await Bun.file(script).text();

  let stdout: string;
  try {
    stdout = await $`aside repl ${source}`.quiet().text();
  } catch (e) {
    throw domainError(
      "aside_failed",
      `Could not drive Aside to fetch a token: ${e instanceof Error ? e.message : String(e)}`,
      { hint: "Is Aside Browser running? Check with `aside account status`." },
    );
  }

  const match = stdout.match(/AM_TOKEN_JSON=(.+)/);
  if (!match?.[1]) {
    throw domainError("token_not_found", "Aside ran but MusicKit exposed no token", {
      hint: "Open music.apple.com in Aside's browser once, then retry.",
    });
  }

  const parsed = JSON.parse(match[1]) as {
    devToken: string;
    userToken: string | null;
    storefront: string | null;
    authorized: boolean;
    exp: number;
  };

  // The one step that cannot be automated: if Chrome's Apple session is signed
  // out, no amount of retrying produces a user token. Say so and stop.
  if (!parsed.authorized || !parsed.userToken) {
    throw domainError("signed_out", "Apple Music is signed out in Aside's browser", {
      hint: "Sign in at https://music.apple.com in Aside's browser, then rerun.",
    });
  }

  const tokens: Tokens = {
    devToken: parsed.devToken,
    userToken: parsed.userToken,
    storefront: parsed.storefront ?? "us",
    exp: parsed.exp,
  };
  await writeKeychain(tokens);
  return tokens;
}

/** Cached tokens, refreshing only when absent or near expiry. */
export async function getTokens(force = false): Promise<Tokens> {
  if (!force) {
    const cached = await readKeychain();
    if (cached && !isExpired(cached)) return cached;
  }
  return refresh();
}

export async function peek(): Promise<Tokens | null> {
  return readKeychain();
}
