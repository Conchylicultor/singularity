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
};

async function getRoot(): Promise<string> {
  const proc = Bun.spawn(["git", "rev-parse", "--show-toplevel"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  return (await new Response(proc.stdout).text()).trim();
}

const check: Check = {
  id: "eslint",
  description: "ESLint rules pass (global + plugin-contributed)",
  async run() {
    const root = await getRoot();

    // One path for build, push, and check: fingerprint every lintable file on its
    // full dependency closure, then lint only the ones whose closure changed. The
    // per-file closure cache (keyed on each file's content + transitive forward
    // import closure + global config) carries soundness and cross-run/worktree
    // reuse, so there is no git-diff candidate narrowing — the full set is cheap
    // because everything but a changed closure is a cache hit.
    const graphs = buildImportGraphs(root);
    const { perFile } = computeClosureFingerprints(root, graphs, graphs.files);

    const cache = openEslintClosureCache();
    const toLint = graphs.files.filter((f) => {
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
