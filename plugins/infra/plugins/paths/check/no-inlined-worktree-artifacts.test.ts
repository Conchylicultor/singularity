/**
 * Regression test for `paths:no-inlined-worktree-artifacts`: re-inlining the
 * per-worktree data dir (`join(SINGULARITY_DIR, "worktrees", …)`) or a raw
 * build/release artifact filename (build-profile*.json, build-logs*.json,
 * build*.log, release-logs-*.json) must be flagged, while lookalikes that are
 * NOT the artifact layout — block comments, route segments, the git-checkout
 * `.claude/worktrees` path, and plugin-import names — must pass through.
 *
 * The detection routes through `grepCode`, which masks comments (and regex
 * literals) before re-scanning; `maskStrings:false` keeps string/template
 * literals in scope so a real inlined path still counts. `grepCode` shells out
 * to `git grep`, so the test stands up a throwaway repo.
 *
 * The 5 {pattern, grepArg} pairs mirror the check verbatim.
 *
 * As with `no-hardcoded-paths.test.ts`'s split `NEEDLE`, the FLAGGED fixture
 * lines are assembled from split tokens so the *contiguous* banned pattern never
 * appears in THIS test's own source — otherwise the real check, scanning the
 * repo with maskStrings:false, would flag these very string literals. The
 * split tokens are joined only into the fixture written to the temp repo.
 */

import { test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { grepCode } from "@plugins/framework/plugins/tooling/plugins/checks/core";

let root = "";

// Mirror of the check's WORKTREE_ARTIFACT_PATTERNS. (grepArg string literals
// here carry no artifact filename `.json`/`.log` suffix, so they never
// self-match when the real check scans this file.)
const PATTERNS: { pattern: RegExp; grepArg: string }[] = [
  { pattern: /SINGULARITY_DIR\s*(?:,\s*["'`]|\}?\/)worktrees/, grepArg: "worktrees" },
  { pattern: /["'`]build-profile[^"'`\s]*\.json/, grepArg: "build-profile" },
  { pattern: /["'`]build-logs[^"'`\s]*\.json/, grepArg: "build-logs" },
  { pattern: /["'`]release-logs[^"'`\s]*\.json/, grepArg: "release-logs" },
  { pattern: /["'`]build(?:-[^"'`\s]*)?\.log/, grepArg: ".log" },
];

// Split tokens: assembled below into the (contiguous) fixture lines written to
// the temp repo, but never spelled contiguously in this source file.
const SDIR = "SINGULARITY_" + "DIR"; // SINGULARITY_DIR
const BP = "build-" + "profile"; // build-profile
const RL = "release-" + "logs"; // release-logs
const BLOG = "build" + ".log"; // build.log
const BT = "`"; // a literal backtick, kept out of nested-template soup

// The 4 FLAGGED fixture lines (each a genuine inlined artifact path).
const L1 = "const a = join(" + SDIR + ', "worktrees", name);';
const L2 = 'const b = join(dir, "' + BP + '.json");';
// `-$` + `{id}.json` split avoids the no-template-curly-in-string lint on a
// plain string that contains a `${…}` sequence; the assembled value is identical.
const L3 = "const c = join(dir, " + BT + RL + "-$" + "{id}.json" + BT + ");";
const L4 = 'const d = join(dir, "' + BLOG + '");';

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), "no-inlined-worktree-artifacts-test-"));
  const fixture = [
    L1, // L1 — FLAGGED (base dir re-inline)
    L2, // L2 — FLAGGED (build-profile filename)
    L3, // L3 — FLAGGED (release-logs template)
    L4, // L4 — FLAGGED (build.log filename)
    "/* legacy artifact was " + BP + ".json in the shared dir */", // L5 — NOT flagged (block comment)
    'const seg = "' + BP + '/:worktree/:buildId";', // L6 — NOT flagged (route segment, no .json)
    'const g = join(repoRoot, ".claude", "worktrees");', // L7 — NOT flagged (git-checkout path, no SINGULARITY_DIR)
    'const imp = "@plugins/build/plugins/' + "build-logs" + '/core";', // L8 — NOT flagged (plugin import name, no .json)
  ].join("\n");
  writeFileSync(join(root, "fixture.ts"), fixture + "\n");

  const run = async (...args: string[]) => {
    const proc = Bun.spawn(args, { cwd: root, stdout: "pipe", stderr: "pipe" });
    await proc.exited;
  };
  await run("git", "init", "-q");
  await run("git", "config", "user.email", "t@t.t");
  await run("git", "config", "user.name", "t");
  await run("git", "add", "-A");
  await run("git", "commit", "-q", "-m", "fixture");
});

afterAll(() => {
  if (root) rmSync(root, { recursive: true, force: true });
});

test("inlined worktree-artifact paths are flagged; lookalikes are ignored", async () => {
  // Mirrors the check: run all 5 patterns, collect the deduped union of
  // `path:line:text` matches.
  const seen = new Set<string>();
  const matches: { line: number; text: string }[] = [];
  for (const p of PATTERNS) {
    const found = await grepCode({
      root,
      pattern: p.pattern,
      grepArg: p.grepArg,
      fixed: true,
      maskStrings: false,
    });
    for (const m of found) {
      const key = `${m.path}:${m.line}:${m.text}`;
      if (seen.has(key)) continue;
      seen.add(key);
      matches.push({ line: m.line, text: m.text });
    }
  }

  const flaggedLines = matches.map((m) => m.line).sort((x, y) => x - y);
  // Exactly the 4 FLAGGED lines (L1–L4), none of the NOT-flagged (L5–L8).
  expect(flaggedLines).toEqual([1, 2, 3, 4]);

  const byLine = new Map(matches.map((m) => [m.line, m.text]));
  expect(byLine.get(1)).toBe(L1);
  expect(byLine.get(2)).toBe(L2);
  expect(byLine.get(3)).toBe(L3);
  expect(byLine.get(4)).toBe(L4);
});
