import { expect, test } from "bun:test";
import { join } from "node:path";

const ENTRY = join(import.meta.dir, "main.ts");

async function run(...args: string[]) {
  const proc = Bun.spawn(["bun", "run", ENTRY, ...args], { stderr: "pipe" });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { stdout, stderr, exitCode };
}

// Everything below stays offline: no Keychain, no Aside, no Music.app. The
// commands that need those are covered by the manual E2E in AGENTS.md, because
// faking Apple's API here would only test the fake.

// `@schema` is the agent-facing UI, so a broken schema is a broken product.
test("@schema exposes the full command surface", async () => {
  const { stdout, stderr, exitCode } = await run("@schema");
  expect(exitCode, stderr).toBe(0);
  // Groups render as nested TypeScript, so assert on the shape agents read.
  for (const fragment of [
    "search(input: {",
    "taste(input: {",
    "play(input: {",
    "playlist: {",
    "create(input: {",
    "auth: {",
    "status()",
  ]) {
    expect(stdout).toContain(fragment);
  }
});

test("search rejects an empty term", async () => {
  const { exitCode, stderr } = await run("search", "{ term: '' }");
  expect(exitCode).not.toBe(0);
  expect(stderr).toContain("error:");
});

test("playlist.create requires at least one track", async () => {
  const { exitCode, stderr } = await run("playlist.create", "{ name: 'x', tracks: [] }");
  expect(exitCode).not.toBe(0);
  expect(stderr).toContain("error:");
});

test("control rejects an unknown action", async () => {
  const { exitCode } = await run("control", "{ action: 'rewind' }");
  expect(exitCode).not.toBe(0);
});
