import { afterAll, afterEach, describe, expect, test } from "bun:test";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { probeClaudeCode } from "./probe";

const dir = mkdtempSync(join(tmpdir(), "sg-claude-probe-"));
const saved = process.env.SINGULARITY_CLAUDE_BIN;

/** A fake `claude` answering `--version` and `auth status --json`. */
function stub(
  auth: string,
  opts: { authExit?: number; version?: string } = {},
): string {
  const path = join(dir, `claude-${Math.random().toString(36).slice(2)}`);
  writeFileSync(
    path,
    [
      "#!/bin/sh",
      `if [ "$1" = "--version" ]; then echo '${opts.version ?? "2.1.282 (Claude Code)"}'; exit 0; fi`,
      `if [ "$1" = "auth" ]; then cat <<'JSON'`,
      auth,
      "JSON",
      `exit ${opts.authExit ?? 0}; fi`,
      "exit 2",
    ].join("\n"),
  );
  chmodSync(path, 0o755);
  return path;
}

afterEach(() => {
  if (saved === undefined) delete process.env.SINGULARITY_CLAUDE_BIN;
  else process.env.SINGULARITY_CLAUDE_BIN = saved;
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("probeClaudeCode", () => {
  test("signed in → ready, with version and account", async () => {
    process.env.SINGULARITY_CLAUDE_BIN = stub(
      '{"loggedIn": true, "authMethod": "claude.ai", "email": "a@b.c", "orgId": "x"}',
    );
    expect(await probeClaudeCode()).toEqual({
      kind: "ready",
      version: "2.1.282",
      authMethod: "claude.ai",
      email: "a@b.c",
    });
  });

  test("signed out → signed-out, whatever the exit code", async () => {
    process.env.SINGULARITY_CLAUDE_BIN = stub('{"loggedIn": false}', {
      authExit: 1,
    });
    expect(await probeClaudeCode()).toEqual({
      kind: "signed-out",
      version: "2.1.282",
    });
  });

  test("no executable → missing, naming where it looked", async () => {
    const nowhere = join(dir, "not-there");
    process.env.SINGULARITY_CLAUDE_BIN = nowhere;
    expect(await probeClaudeCode()).toEqual({
      kind: "missing",
      searched: [nowhere],
    });
  });

  test("output that is not its JSON → unreadable, never a verdict", async () => {
    process.env.SINGULARITY_CLAUDE_BIN = stub("Error: something broke", {
      authExit: 1,
    });
    const s = await probeClaudeCode();
    expect(s.kind).toBe("unreadable");
    if (s.kind === "unreadable") expect(s.error).toContain("something broke");
  });

  test("JSON of the wrong shape → unreadable", async () => {
    process.env.SINGULARITY_CLAUDE_BIN = stub('{"loggedIn": "yes"}');
    expect((await probeClaudeCode()).kind).toBe("unreadable");
  });
});
