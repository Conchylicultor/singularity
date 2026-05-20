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
  return targets.sort((a, b) => a.name.localeCompare(b.name));
}
