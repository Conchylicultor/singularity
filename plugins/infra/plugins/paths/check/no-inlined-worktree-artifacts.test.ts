/**
 * Regression test for `paths:no-inlined-worktree-artifacts`: re-inlining the
 * per-worktree data dir (`join(dataRoot(), "worktrees", …)`), the namespace's
 * registration record (spec.json) or a raw build/release artifact filename
 * (build-profile*.json, build-logs*.json, build*.log, release-logs-*.json) must
 * be flagged, while lookalikes that are NOT the per-worktree layout — block
 * comments, route segments, the git-checkout `.claude/worktrees` path, an
 * unrelated `*.spec.json`, and plugin-import names — must pass through.
 *
 * The detection routes through `grepCode`, which masks comments (and regex
 * literals) before re-scanning; `maskStrings:false` keeps string/template
 * literals in scope so a real inlined path still counts. `grepCode` shells out
 * to `git grep`, so the test stands up a throwaway repo.
 *
 * The 6 {pattern, grepArg} pairs mirror the check verbatim. (`SJ` is the one
 * grepArg spelled as a split token: unlike the others it carries the full
 * filename, so written contiguously it would match its own pattern when the
 * real check scans this file.)
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

// `spec.json`, split — the one grepArg carrying a whole filename, so spelled
// contiguously it would match its own pattern below. Declared up here rather
// than with the other split tokens because PATTERNS reads it at module eval.
const SJ = "spec" + ".json";

// Mirror of the check's WORKTREE_ARTIFACT_PATTERNS. (Every other grepArg string
// literal here carries no artifact filename `.json`/`.log` suffix, so they
// never self-match when the real check scans this file.)
const PATTERNS: { pattern: RegExp; grepArg: string }[] = [
  {
    pattern: /dataRoot\s*\(\s*\)\s*(?:,\s*["'`]|\}?\/)worktrees/,
    grepArg: "worktrees",
  },
  { pattern: /["'`]build-profile[^"'`\s]*\.json/, grepArg: "build-profile" },
  { pattern: /["'`]build-logs[^"'`\s]*\.json/, grepArg: "build-logs" },
  { pattern: /["'`]release-logs[^"'`\s]*\.json/, grepArg: "release-logs" },
  { pattern: /["'`]build(?:-[^"'`\s]*)?\.log/, grepArg: ".log" },
  { pattern: /["'`]spec\.json/, grepArg: SJ },
];

// Split tokens: assembled below into the (contiguous) fixture lines written to
// the temp repo, but never spelled contiguously in this source file.
const DROOT = "dataRoot" + "()"; // dataRoot()
const BP = "build-" + "profile"; // build-profile
const RL = "release-" + "logs"; // release-logs
const BLOG = "build" + ".log"; // build.log
const BT = "`"; // a literal backtick, kept out of nested-template soup

// The 5 FLAGGED fixture lines (each a genuine inlined per-worktree path).
const L1 = "const a = join(" + DROOT + ', "worktrees", name);';
const L2 = 'const b = join(dir, "' + BP + '.json");';
// `-$` + `{id}.json` split avoids the no-template-curly-in-string lint on a
// plain string that contains a `${…}` sequence; the assembled value is identical.
const L3 = "const c = join(dir, " + BT + RL + "-$" + "{id}.json" + BT + ");";
const L4 = 'const d = join(dir, "' + BLOG + '");';
const L5 = 'const e = join(dir, "' + SJ + '");';

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), "no-inlined-worktree-artifacts-test-"));
  const fixture = [
    L1, // L1 — FLAGGED (base dir re-inline)
    L2, // L2 — FLAGGED (build-profile filename)
    L3, // L3 — FLAGGED (release-logs template)
    L4, // L4 — FLAGGED (build.log filename)
    L5, // L5 — FLAGGED (spec.json registration record)
    "/* legacy artifact was " + BP + ".json in the shared dir */", // L6 — NOT flagged (block comment)
    'const seg = "' + BP + '/:worktree/:buildId";', // L7 — NOT flagged (route segment, no .json)
    'const g = join(repoRoot, ".claude", "worktrees");', // L8 — NOT flagged (git-checkout path, not the data root)
    'const imp = "@plugins/build/plugins/' + "build-logs" + '/core";', // L9 — NOT flagged (plugin import name, no .json)
    'const h = join(srcTauri, "appdmg.' + SJ + '");', // L10 — NOT flagged (a different file that merely ends in .spec.json)
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
  // Mirrors the check: run all 6 patterns, collect the deduped union of
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
  // Exactly the 5 FLAGGED lines (L1–L5), none of the NOT-flagged (L6–L10).
  expect(flaggedLines).toEqual([1, 2, 3, 4, 5]);

  const byLine = new Map(matches.map((m) => [m.line, m.text]));
  expect(byLine.get(1)).toBe(L1);
  expect(byLine.get(2)).toBe(L2);
  expect(byLine.get(3)).toBe(L3);
  expect(byLine.get(4)).toBe(L4);
  expect(byLine.get(5)).toBe(L5);
});
