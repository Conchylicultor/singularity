import { existsSync, readdirSync, statSync, unlinkSync } from "fs";
import { join } from "path";

type CheckResult = { ok: true } | { ok: false; message: string; hint?: string };
type Check = { id: string; description: string; run(): Promise<CheckResult> };

async function getRoot(): Promise<string> {
  const proc = Bun.spawn(["git", "rev-parse", "--show-toplevel"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  return (await new Response(proc.stdout).text()).trim();
}

function newestMtimeMs(dir: string): number {
  let max = 0;
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      max = Math.max(max, newestMtimeMs(full));
    } else if (e.name.endsWith(".ts")) {
      max = Math.max(max, statSync(full).mtimeMs);
    }
  }
  return max;
}

function bustCacheIfStale(root: string, cacheLocation: string): void {
  if (!existsSync(cacheLocation)) return;
  const cacheMtime = statSync(cacheLocation).mtimeMs;

  const lintSourceDirs = [
    join(root, "plugins", "framework", "plugins", "tooling", "plugins", "lint", "core"),
    ...findPluginLintDirs(root),
  ];
  const configFile = join(root, "eslint.config.ts");

  let newestSource = 0;
  if (existsSync(configFile)) {
    newestSource = Math.max(newestSource, statSync(configFile).mtimeMs);
  }
  for (const dir of lintSourceDirs) {
    newestSource = Math.max(newestSource, newestMtimeMs(dir));
  }

  if (newestSource > cacheMtime) {
    unlinkSync(cacheLocation);
  }
}

function findPluginLintDirs(root: string): string[] {
  const pluginsRoot = join(root, "plugins");
  const dirs: string[] = [];
  function walk(dir: string, depth: number) {
    if (depth > 10) return;
    const lintDir = join(dir, "lint");
    if (existsSync(join(lintDir, "index.ts"))) dirs.push(lintDir);
    const nested = join(dir, "plugins");
    let entries;
    try {
      entries = readdirSync(nested, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.isDirectory()) walk(join(nested, e.name), depth + 1);
    }
  }
  let entries;
  try {
    entries = readdirSync(pluginsRoot, { withFileTypes: true });
  } catch {
    return dirs;
  }
  for (const e of entries) {
    if (e.isDirectory()) walk(join(pluginsRoot, e.name), 0);
  }
  return dirs;
}

// `./singularity build` sets SINGULARITY_ESLINT_SCOPE to a newline-separated
// list of the branch's changed .ts/.tsx files (already filtered against the
// config's ignore globs) so a cold first build lints only the diff instead of
// all ~2k files (~10 min → seconds). Unset — push, `./singularity check`, and
// main builds — means a full-repo lint, preserving the complete type-aware gate.
// Defined-but-empty means nothing lint-relevant changed (skip).
function eslintScope(): string[] | null {
  const raw = process.env.SINGULARITY_ESLINT_SCOPE;
  if (raw === undefined) return null;
  return raw.split("\n").map((s) => s.trim()).filter(Boolean);
}

const check: Check = {
  id: "eslint",
  description: "ESLint rules pass (global + plugin-contributed)",
  async run() {
    const root = await getRoot();
    const scope = eslintScope();
    if (scope !== null && scope.length === 0) return { ok: true };
    const targets = scope ?? ["."];
    // Scoped (build) runs use a separate cache file: ESLint's `--cache` prunes
    // entries for files outside the current run, so a scoped run would shrink
    // the canonical full-repo cache that push / `./singularity check` depend on.
    const cacheLocation = join(root, ".cache", scope !== null ? "eslint-scoped" : "eslint");
    bustCacheIfStale(root, cacheLocation);
    const proc = Bun.spawn(
      [process.execPath, "x", "eslint", ...targets, "--quiet", "--cache", "--cache-location", cacheLocation, "--cache-strategy", "content"],
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
    if (exitCode === 0) return { ok: true };
    const combined = [stdout.trim(), stderr.trim()].filter(Boolean).join("\n").trim();
    return {
      ok: false,
      message: `ESLint reported violations:\n  ${combined.split("\n").join("\n  ")}`,
      hint: "Global rules live in plugins/framework/plugins/tooling/plugins/lint/core/; plugin rules in plugins/<name>/lint/index.ts. Do NOT silence violations with eslint-disable comments or modify rule configs to make them pass. If you believe a violation is a false positive, STOP and report it to the user — do not work around it.",
    };
  },
};

export default check;
