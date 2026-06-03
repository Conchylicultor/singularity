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

  return targets.sort((a, b) => a.name.localeCompare(b.name));
}
