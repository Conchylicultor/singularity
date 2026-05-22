import { existsSync, readdirSync, readFileSync } from "fs";
import { join, relative, sep } from "path";

function safeReaddir(dir: string) {
  try {
    return readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

/**
 * Walks all directories in the `plugins/<X>/plugins/<Y>/...` nesting pattern,
 * regardless of whether they have web/server/central barrels.
 */
function walkPluginTree(root: string): string[] {
  const out: string[] = [];
  function walk(dir: string, depth: number) {
    if (depth > 10) return;
    if (dir !== root) out.push(dir);
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      if (dir === root) walk(join(dir, e.name), depth + 1);
      else if (e.name === "plugins") {
        for (const c of readdirSync(join(dir, e.name), { withFileTypes: true })) {
          if (c.isDirectory()) walk(join(dir, e.name, c.name), depth + 1);
        }
      }
    }
  }
  walk(root, 0);
  return out;
}

/**
 * Plugin directories that have web/, server/, or central/ barrels.
 * Used by eslint.config.ts for lint rule discovery.
 */
export function findPluginDirs(root: string): string[] {
  return walkPluginTree(root).filter(
    (dir) =>
      existsSync(join(dir, "web", "index.ts")) ||
      existsSync(join(dir, "server", "index.ts")) ||
      existsSync(join(dir, "central", "index.ts")) ||
      existsSync(join(dir, "check", "index.ts")) ||
      existsSync(join(dir, "lint", "index.ts")) ||
      existsSync(join(dir, "facet", "index.ts")),
  );
}

function isInLocalTsconfigInclude(pluginDir: string, fileName: string): boolean {
  for (const entry of safeReaddir(pluginDir)) {
    if (!entry.isFile() || !/^tsconfig.*\.json$/.test(entry.name)) continue;
    try {
      const tsconfig = JSON.parse(readFileSync(join(pluginDir, entry.name), "utf-8"));
      const includes: string[] = tsconfig.include ?? [];
      if (includes.includes(fileName)) return true;
    } catch {
      continue;
    }
  }
  return false;
}

/**
 * Scans the repo for files that need `allowDefaultProject` coverage —
 * lint rules, scripts, and config files not covered by any tsconfig project.
 *
 * Returns exact relative paths (no globs) suitable for typescript-eslint's
 * `allowDefaultProject` option. Handles arbitrary plugin nesting depths.
 */
export function discoverAllowDefaultProject(repoRoot: string): string[] {
  const files: string[] = [];

  // Root-level *.config.ts
  for (const entry of safeReaddir(repoRoot)) {
    if (entry.isFile() && entry.name.endsWith(".config.ts")) {
      files.push(entry.name);
    }
  }

  const pluginsRoot = join(repoRoot, "plugins");
  if (!existsSync(pluginsRoot)) return files;

  for (const pluginDir of walkPluginTree(pluginsRoot)) {
    const rel = relative(repoRoot, pluginDir).split(sep).join("/");

    // lint/*.ts
    for (const entry of safeReaddir(join(pluginDir, "lint"))) {
      if (entry.isFile() && entry.name.endsWith(".ts")) {
        files.push(`${rel}/lint/${entry.name}`);
      }
    }

    // scripts/*.ts
    for (const entry of safeReaddir(join(pluginDir, "scripts"))) {
      if (entry.isFile() && entry.name.endsWith(".ts")) {
        files.push(`${rel}/scripts/${entry.name}`);
      }
    }

    // *.config.ts at plugin root, excluding files already in a local tsconfig
    for (const entry of safeReaddir(pluginDir)) {
      if (
        entry.isFile() &&
        entry.name.endsWith(".config.ts") &&
        !isInLocalTsconfigInclude(pluginDir, entry.name)
      ) {
        files.push(`${rel}/${entry.name}`);
      }
    }
  }

  return files;
}
