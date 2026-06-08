import { createHash } from "crypto";
import {
  buildImportGraphs,
  computeClosureFingerprints,
  openEslintClosureCache,
} from "@plugins/framework/plugins/tooling/plugins/checks/plugins/eslint/core";

type CheckResult = { ok: true } | { ok: false; message: string; hint?: string };
type Check = {
  id: string;
  description: string;
  run(): Promise<CheckResult>;
  cacheSignature?(): string | null;
};

async function getRoot(): Promise<string> {
  const proc = Bun.spawn(["git", "rev-parse", "--show-toplevel"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  return (await new Response(proc.stdout).text()).trim();
}

// `./singularity build` and `./singularity push` set SINGULARITY_ESLINT_SCOPE to
// a newline-separated list of the branch's affected .ts/.tsx files (changed +
// transitive importers, already filtered against the config's ignore globs) so a
// scoped run lints only the affected set instead of all ~2k files. Unset —
// `./singularity check` and main builds — means the full lintable set. The
// closure cache (keyed on each file's content + its transitive forward-import
// closure + global config) then skips every file whose closure is unchanged, so
// the scope env is only a candidate-narrowing fast path: correctness comes from
// the fingerprint, not the scope. Defined-but-empty means nothing lint-relevant
// changed (skip).
function eslintScope(): string[] | null {
  const raw = process.env.SINGULARITY_ESLINT_SCOPE;
  if (raw === undefined) return null;
  return raw.split("\n").map((s) => s.trim()).filter(Boolean);
}

const check: Check = {
  id: "eslint",
  description: "ESLint rules pass (global + plugin-contributed)",
  // The eslint surface is parameterized by its scope env, so the outer
  // check-cache key folds it in: a scoped affected-set run and a full run are
  // different candidate sets over the same tree. The per-file closure cache (not
  // this signature) carries cross-run/worktree reuse; this only keeps a full run
  // and a scoped run from aliasing each other's outer check-cache entry.
  cacheSignature() {
    const scope = eslintScope();
    if (scope === null) return "scope=full";
    if (scope.length === 0) return "scope=empty";
    return `scope=list:${createHash("sha256").update([...scope].sort().join("\n")).digest("hex")}`;
  },
  async run() {
    const root = await getRoot();
    const scope = eslintScope();
    if (scope !== null && scope.length === 0) return { ok: true };

    // Build the import graph once; the candidate set is the affected scope (when
    // provided) or every lintable file. Then fingerprint each candidate on its
    // full dependency closure and skip the ones whose closure already PASSed.
    const graphs = buildImportGraphs(root);
    const candidates = scope ?? graphs.files;
    const { perFile } = computeClosureFingerprints(root, graphs, candidates);

    const cache = openEslintClosureCache();
    const toLint = candidates.filter((f) => {
      const fp = perFile.get(f);
      return !fp || !cache.has(f, fp); // unreadable fingerprint → lint to be safe
    });
    if (toLint.length === 0) return { ok: true };

    // Lint the not-yet-cached set with NO native --cache: the closure cache
    // above already does the (sound, cross-file) caching, and eslint's
    // content-`--cache` would be unsound for type-aware rules.
    const proc = Bun.spawn(
      [process.execPath, "x", "eslint", ...toLint, "--quiet"],
      {
        cwd: root,
        stdout: "pipe",
        stderr: "pipe",
      },
    );
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
    if (exitCode === 0) {
      // Record a PASS per linted file keyed on its closure fingerprint.
      for (const f of toLint) {
        const fp = perFile.get(f);
        if (fp) cache.record(f, fp);
      }
      return { ok: true };
    }
    // Failure: a batch exit can't attribute violations per file, so record
    // NOTHING — conservative (re-lints the batch next time, never a false PASS).
    const combined = [stdout.trim(), stderr.trim()].filter(Boolean).join("\n").trim();
    return {
      ok: false,
      message: `ESLint reported violations:\n  ${combined.split("\n").join("\n  ")}`,
      hint: "Global rules live in plugins/framework/plugins/tooling/plugins/lint/core/; plugin rules in plugins/<name>/lint/index.ts. Do NOT silence violations with eslint-disable comments or modify rule configs to make them pass. If you believe a violation is a false positive, STOP and report it to the user — do not work around it.",
    };
  },
};

export default check;
