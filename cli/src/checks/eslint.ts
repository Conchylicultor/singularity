import { existsSync, readdirSync } from "fs";
import { join, relative, sep } from "path";
import type { Check } from "./types";

async function getRoot(): Promise<string> {
  const proc = Bun.spawn(["git", "rev-parse", "--show-toplevel"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  return (await new Response(proc.stdout).text()).trim();
}

/**
 * Walk plugins/ for any plugin that contributes a `lint/index.ts`. ESLint is
 * scoped to *those* plugin subtrees only — running it across the whole repo
 * would surface unrelated `eslint-disable-next-line` directives that reference
 * rules our config doesn't define (legacy editor-emitted comments referencing
 * `react-hooks/*`, `jsx-a11y/*`, etc.). Scoping by lint-contributing plugin
 * keeps the system additive: a plugin opts into ESLint by adding `lint/`,
 * everything else is untouched.
 */
function findLintingPluginPaths(root: string): string[] {
  const pluginsRoot = join(root, "plugins");
  if (!existsSync(pluginsRoot)) return [];
  const out: string[] = [];
  function walk(dir: string, depth: number) {
    if (depth > 10) return;
    const hasWeb = existsSync(join(dir, "web", "index.ts"));
    const hasServer = existsSync(join(dir, "server", "index.ts"));
    const hasCentral = existsSync(join(dir, "central", "index.ts"));
    if ((hasWeb || hasServer || hasCentral) && dir !== pluginsRoot) {
      if (existsSync(join(dir, "lint", "index.ts"))) {
        out.push(relative(root, dir).split(sep).join("/"));
      }
    }
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      if (dir === pluginsRoot) walk(join(dir, e.name), depth + 1);
      else if (e.name === "plugins") {
        for (const c of readdirSync(join(dir, e.name), { withFileTypes: true })) {
          if (c.isDirectory()) walk(join(dir, e.name, c.name), depth + 1);
        }
      }
    }
  }
  walk(pluginsRoot, 0);
  return out;
}

/**
 * Run ESLint on every plugin subtree that contributes a `lint/index.ts`.
 * The flat config at `eslint.config.ts` auto-discovers the rules; this
 * check just provides the file list. No-op if no plugin opts in.
 */
export const eslintCheck: Check = {
  id: "eslint",
  description: "Plugin-contributed ESLint rules pass",
  async run() {
    const root = await getRoot();
    const targets = findLintingPluginPaths(root);
    if (targets.length === 0) return { ok: true };

    const proc = Bun.spawn(["bunx", "eslint", ...targets], {
      cwd: root,
      stdout: "pipe",
      stderr: "pipe",
    });
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
      hint: "Each plugin's lint rules live in plugins/<name>/lint/index.ts. Fix the offending source, or revisit the rule definition if it's overreaching.",
    };
  },
};
