import { existsSync } from "node:fs";
import { join } from "node:path";
import type {
  Check,
  CheckResult,
} from "@plugins/framework/plugins/tooling/core";
import { REPO_ROOT } from "@plugins/infra/plugins/paths/core";
import { spawnCaptured } from "@plugins/infra/plugins/spawn/core";
import {
  findImports,
  lineAt,
  maskSource,
} from "@plugins/plugin-meta/plugins/parse-utils/core";
import { fakeDomInstalls } from "../core/fake-dom";
import {
  BUN_TEST_IGNORE,
  DOM_TEST_INCLUDE,
  isBunTestPath,
  isDomTestPath,
} from "../core/test-layout";

const BUNFIG = "bunfig.toml";
const VITEST_CONFIG = "vitest.config.ts";

/**
 * The runner split, enforced.
 *
 * The repo runs two test runners and picks between them BY FILE LOCATION. That
 * only holds if the two scopes stay exact complements and no test file imports
 * the other runner's API. Nothing enforced it, and it was false: `bunfig.toml`
 * scoped `bun test` to nothing, so `bun test <plugin-dir>` loaded the
 * vitest-only jsdom suites and produced a wall of failures indistinguishable
 * from real ones.
 *
 * Five rules, every offender reported:
 *   (a) no bun:test file imports `vitest`      — the direct guard on that bug
 *   (b) no vitest file imports `bun:test`      — the mirror direction
 *   (c) no test file sits under a `__tests__/` dir that is not
 *       `plugins/**\/web/__tests__/` — either it is in NEITHER runner's scope
 *       (silently never run) or it is a bun:test suite wearing vitest's
 *       directory convention
 *   (d) both scope literals are still present in their config files — this is
 *       what makes the fix structural instead of deletable
 *   (e) no bun:test file builds itself a fake DOM — see {@link FAKE_DOM_GLOBALS}
 *
 * NOT `inputKeyed`: unlike the `grepCode`-only pattern checks, this one
 * discovers files via `git ls-files` and reads `bunfig.toml` /
 * `vitest.config.ts` directly, so its reads do NOT route through the recording
 * `FileSystemView`. Declaring it input-keyed would record an incomplete
 * read-set and could produce a stale PASS. It takes the legacy whole-tree key.
 */
const check: Check = {
  id: "test-layout:runner-split",
  description:
    "bun:test and vitest scopes stay exact complements: no test file imports the other runner, no stray `__tests__/` suite, and both scope literals survive in bunfig.toml / vitest.config.ts",
  async run(): Promise<CheckResult> {
    const root = REPO_ROOT;
    const sections: string[] = [];

    // ---- rules (a)–(c): the test-file sweep --------------------------------
    const files = await listTestFiles(root);

    const crossVitest: string[] = [];
    const crossBunTest: string[] = [];
    const fakeDom: string[] = [];

    await Promise.all(
      files.map(async (rel) => {
        const src = await Bun.file(join(root, rel)).text();
        const dom = isDomTestPath(rel);

        // (e) A bun:test file installing a browser global onto `globalThis`.
        if (isBunTestPath(rel)) {
          for (const install of fakeDomInstalls(src)) {
            fakeDom.push(
              `${rel}:${lineAt(src, install.index)}  (installs \`${install.name}\`)`,
            );
          }
        }

        // A test file's runner is decided by WHERE it lives, so the banned
        // specifier is whichever runner does not own this location.
        const banned = dom ? "bun:test" : "vitest";
        const lines = src.split("\n");
        for (const ref of runnerImports(src)) {
          if (
            ref.specifier !== banned &&
            !ref.specifier.startsWith(`${banned}/`)
          )
            continue;
          const line = lineAt(src, ref.index);
          const entry = `${rel}:${line}:${(lines[line - 1] ?? "").trim()}`;
          if (dom) crossBunTest.push(entry);
          else crossVitest.push(entry);
        }
      }),
    );

    if (crossVitest.length > 0) {
      sections.push(
        `(a) ${crossVitest.length} bun:test file(s) import \`vitest\` — bun:test runs these and cannot resolve it:\n    ${crossVitest.sort().join("\n    ")}`,
      );
    }
    if (crossBunTest.length > 0) {
      sections.push(
        `(b) ${crossBunTest.length} vitest file(s) under \`web/__tests__/\` import \`bun:test\` — vitest runs these and cannot resolve it:\n    ${crossBunTest.sort().join("\n    ")}`,
      );
    }

    // (c) Any `__tests__/` dir other than `plugins/**/web/__tests__/`. Two
    // flavours, both wrong, distinguished in the report because the fix differs:
    // an orphan runs under NO runner; a misplaced suite runs under bun:test
    // while claiming vitest's directory convention.
    const strays = files
      .filter(
        (rel) => !isDomTestPath(rel) && rel.split("/").includes("__tests__"),
      )
      .map(
        (rel) =>
          `${rel}  (${isBunTestPath(rel) ? "bun:test suite wearing vitest's `__tests__/` convention" : "in NEITHER runner's scope — never runs"})`,
      );
    if (strays.length > 0) {
      sections.push(
        `(c) ${strays.length} test file(s) under a \`__tests__/\` dir that is not \`plugins/**/web/__tests__/\`:\n    ${strays.sort().join("\n    ")}`,
      );
    }

    if (fakeDom.length > 0) {
      sections.push(
        `(e) ${fakeDom.length} bun:test file(s) install a browser global on \`globalThis\` — bun:test has no DOM, and a hand-built one is a PARTIAL one:\n    ${fakeDom.sort().join("\n    ")}`,
      );
    }

    // ---- rule (d): the two scope literals ---------------------------------
    // A substring assert, not a parse: the point is that the exact string a
    // human would delete is still there.
    const scopeDrift = await checkScopeLiterals(root);
    if (scopeDrift !== null) sections.push(scopeDrift);

    if (sections.length === 0) return { ok: true };

    return {
      ok: false,
      message: `test-runner layout violations:\n  ${sections.join("\n  ")}`,
      hint: "The runner is chosen by where the file lives: pure-logic tests are `*.test.ts(x)` next to their source and run under `bun:test`; jsdom/React tests live in the plugin's `web/__tests__/` and run under vitest. Move the file to the folder that matches its runner rather than swapping the import (or stubbing the DOM it lacks) — and never introduce a `__tests__/` dir outside `web/`. The two scope literals in `bunfig.toml` and `vitest.config.ts` are a complementary pair; edit neither alone.",
    };
  },
};

/**
 * Every test file in the checkout, repo-relative. `--cached --others
 * --exclude-standard` is tracked + not-yet-committed but never gitignored, so a
 * brand-new offender is visible while `node_modules` and nested worktrees are
 * not. (`git grep` would miss the untracked file; `Bun.Glob` would walk the
 * ignored trees.)
 *
 * Files DELETED in the working tree are then subtracted, because `--cached`
 * lists the index and a deletion is not staged until it is committed: a test
 * file moved or removed in a worktree is still an index entry with no bytes on
 * disk, and reading it threw an ENOENT that took the whole build down with it.
 * Asking git for that set is exact — a `catch` on the read, or an `existsSync`
 * filter, would also swallow a genuinely unreadable file.
 */
async function listTestFiles(root: string): Promise<string[]> {
  const [present, deleted] = await Promise.all([
    lsFiles(root, ["--cached", "--others", "--exclude-standard"]),
    lsFiles(root, ["--deleted"]),
  ]);
  const gone = new Set(deleted);
  return present.filter((rel) => !gone.has(rel));
}

/** One `git ls-files` pass over the test-file globs, repo-relative. */
async function lsFiles(root: string, flags: string[]): Promise<string[]> {
  const result = await spawnCaptured(
    ["git", "ls-files", ...flags, "--", "*.test.ts", "*.test.tsx"],
    { cwd: root },
  );
  // An empty list from a FAILED git call would silently pass every file rule —
  // the enumeration failing must be loud, not an absorbed "no offenders".
  if (result.exitCode !== 0) {
    throw new Error(
      `git ls-files failed in ${root} (exit ${result.exitCode}): ${result.stderr.trim()}`,
    );
  }
  return result.stdout
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}

interface RunnerImport {
  specifier: string;
  /** Offset of the specifier's first character in the ORIGINAL source. */
  index: number;
}

/**
 * Every module specifier the file imports, static or dynamic.
 *
 * `findImports` covers `import …`, `import type …`, `export … from` and bare
 * side-effect imports, all string-masked so a specifier inside a comment or a
 * docs snippet cannot match. Dynamic `import("…")` is added here with the same
 * masked-scan / read-from-original technique: the opening quote is located in
 * the MASKED text (where a quote inside a string or comment has been blanked)
 * and the specifier is then read back out of the original bytes.
 */
function runnerImports(src: string): RunnerImport[] {
  const out: RunnerImport[] = findImports(src).map((imp) => ({
    specifier: imp.specifier,
    index: imp.index,
  }));

  const masked = maskSource(src);
  const dynamic = /\bimport\s*\(\s*(["'`])/g;
  let m: RegExpExecArray | null;
  while ((m = dynamic.exec(masked))) {
    const openQuote = m.index + m[0].length - 1;
    const close = masked.indexOf(masked[openQuote]!, openQuote + 1);
    if (close < 0) continue;
    out.push({
      specifier: src.slice(openQuote + 1, close),
      index: openQuote + 1,
    });
  }
  return out;
}

/**
 * Rule (d). Each half names the OTHER file: the two literals are a
 * complementary pair, and removing one alone is precisely what reintroduces the
 * cross-load — so the message has to point at the half that is still standing.
 */
async function checkScopeLiterals(root: string): Promise<string | null> {
  const bunfigPath = join(root, BUNFIG);
  const vitestPath = join(root, VITEST_CONFIG);

  if (!existsSync(bunfigPath)) {
    return `(d) \`${BUNFIG}\` is missing — it must carry \`pathIgnorePatterns = ["${BUN_TEST_IGNORE}"]\`, the exact complement of the \`include\` in \`${VITEST_CONFIG}\`.`;
  }
  if (!existsSync(vitestPath)) {
    return `(d) \`${VITEST_CONFIG}\` is missing — it must carry \`include: ["${DOM_TEST_INCLUDE}"]\`, the exact complement of \`pathIgnorePatterns\` in \`${BUNFIG}\`.`;
  }

  // Comments are stripped FIRST. Both files explain the pair in a comment that
  // quotes the very literal being asserted, so a whole-file substring test would
  // still pass after the live directive was deleted — the check would guard the
  // prose and not the setting. `maskSource` blanks JS/TS comments (strings kept
  // intact, which is where the literal lives); TOML gets the same treatment from
  // the small stripper below.
  const bunfig = stripTomlComments(await Bun.file(bunfigPath).text());
  const vitestConfig = maskSource(await Bun.file(vitestPath).text(), {
    strings: false,
  });

  const bunfigOk = bunfig.includes(BUN_TEST_IGNORE);
  const vitestOk = vitestConfig.includes(DOM_TEST_INCLUDE);
  if (bunfigOk && vitestOk) return null;

  if (!bunfigOk && !vitestOk) {
    return `(d) BOTH scope literals are gone: \`${BUNFIG}\` no longer contains \`${BUN_TEST_IGNORE}\` and \`${VITEST_CONFIG}\` no longer contains \`${DOM_TEST_INCLUDE}\`. Neither runner is scoped, so both load every test file.`;
  }
  if (!bunfigOk) {
    return `(d) \`${BUNFIG}\` no longer contains the bun:test ignore \`${BUN_TEST_IGNORE}\`, but \`${VITEST_CONFIG}\` still scopes vitest to \`${DOM_TEST_INCLUDE}\`. That asymmetry IS the bug: with only the vitest half in place, \`bun test <plugin-dir>\` re-loads the jsdom suites it must never run.`;
  }
  return `(d) \`${VITEST_CONFIG}\` no longer contains the include \`${DOM_TEST_INCLUDE}\`, but \`${BUNFIG}\` still ignores \`${BUN_TEST_IGNORE}\`. With only the bun:test half in place, the \`web/__tests__/\` suites are excluded from bun:test and no longer claimed by vitest — they run under no runner at all.`;
}

/**
 * Blank `#`-to-end-of-line TOML comments, leaving quoted strings intact — the
 * TOML twin of `maskSource`'s comment handling, so the rule-(d) assert sees the
 * live directives only. A `#` inside a quoted value is not a comment.
 */
function stripTomlComments(src: string): string {
  return src
    .split("\n")
    .map((line) => {
      let quote: string | null = null;
      for (let i = 0; i < line.length; i++) {
        const c = line[i]!;
        if (quote) {
          if (c === quote) quote = null;
        } else if (c === '"' || c === "'") {
          quote = c;
        } else if (c === "#") {
          return line.slice(0, i);
        }
      }
      return line;
    })
    .join("\n");
}

export default check;
