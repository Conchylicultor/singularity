import { existsSync, readdirSync } from "fs";
import { join } from "path";

export interface TscTarget {
  name: string;
  dir: string;
  args: string[];
  hasEntrypoint: boolean;
}

export function discoverTscTargets(root: string): TscTarget[] {
  const pluginsDir = join(root, "plugins/framework/plugins");
  const entries = readdirSync(pluginsDir, { withFileTypes: true });
  const targets: TscTarget[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const dir = join(pluginsDir, entry.name);
    if (!existsSync(join(dir, "tsconfig.json"))) continue;
    const hasApp = existsSync(join(dir, "tsconfig.app.json"));
    targets.push({
      name: entry.name,
      dir,
      args: hasApp ? ["-p", "tsconfig.app.json"] : [],
      hasEntrypoint: existsSync(join(dir, "bin", "index.ts")),
    });

    // A sibling `tsconfig.node.json` (web-core's vite/vitest config files) owns
    // lintable files no other project includes; give it its own target so the
    // type-check covers and lints them. Not a runtime entrypoint — the build's
    // per-entrypoint tsc loop filters it out via hasEntrypoint.
    if (existsSync(join(dir, "tsconfig.node.json"))) {
      targets.push({
        name: `${entry.name}-node`,
        dir,
        args: ["-p", "tsconfig.node.json"],
        hasEntrypoint: false,
      });
    }
  }

  // Root-level tools project: owns the build-time files (lint barrels, plugin
  // scripts, root/plugin *.config.ts) that no runtime tsconfig includes. Not a
  // runtime entrypoint, so the build's per-entrypoint tsc loop skips it; the
  // `typescript` check runs every target, so it gets type-checked there.
  if (existsSync(join(root, "tsconfig.tools.json"))) {
    targets.push({
      name: "tools",
      dir: root,
      args: ["-p", "tsconfig.tools.json"],
      hasEntrypoint: false,
    });
  }

  // Root-level test project: owns every `*.test.ts(x)` / `__tests__/**` file,
  // which the runtime tsconfigs now exclude. Without it those files belong to
  // no program — type-checked here (matching the dedicated test project main
  // references via `tsc -b`) and linted via the same program.
  if (existsSync(join(root, "tsconfig.test.json"))) {
    targets.push({
      name: "test",
      dir: root,
      args: ["-p", "tsconfig.test.json"],
      hasEntrypoint: false,
    });
  }

  return targets.sort((a, b) => a.name.localeCompare(b.name));
}

// Stable per-target `.tsbuildinfo` location for incremental type-checking.
// Lives under `.cache/` (gitignored) — OUTSIDE `node_modules`, so it survives
// the `bun install` that every build runs. Warmed before each run from the
// host-global pool in `./warm-base.ts`, so a fresh worktree's first check
// starts from whatever any worktree checked most recently.
export function tsBuildInfoPath(root: string, targetName: string): string {
  return join(root, ".cache", "tsbuildinfo", `${targetName}.tsbuildinfo`);
}
