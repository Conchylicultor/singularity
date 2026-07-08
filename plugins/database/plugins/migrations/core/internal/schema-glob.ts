import { readFileSync } from "fs";
import { relative, resolve } from "path";

// drizzle.config.ts lives here; its `schema: [...]` globs are relative to it.
const MIGRATIONS_PLUGIN_DIR = "plugins/database/plugins/migrations";

/**
 * Parse the `schema: [ ... ]` string-literal array out of drizzle.config.ts.
 * Returns the array of raw glob patterns (still relative to the config file), or
 * `null` if the array can't be located (the caller fails loudly).
 */
export function parseSchemaGlobs(configText: string): string[] | null {
  // Grab the array body between `schema:` `[` and the matching `]`.
  const arrayMatch = configText.match(/schema\s*:\s*\[([^\]]*)\]/);
  if (!arrayMatch) return null;
  const body = arrayMatch[1]!;
  // Pull each quoted string literal out of the array body.
  const patterns = [...body.matchAll(/["'`]([^"'`]+)["'`]/g)].map((m) => m[1]!);
  if (patterns.length === 0) return null;
  return patterns;
}

/**
 * Enumerate the schema-glob files drizzle-kit discovers: read drizzle.config.ts,
 * parse its `schema:` array, resolve each config-relative glob to a repo-relative
 * glob (the form `Bun.Glob` / `git grep` report paths in), and expand against the
 * repo. Returns a sorted array of repo-relative paths. Throws loudly (fail
 * closed) if the config's glob array can't be parsed.
 */
export function schemaGlobFiles(root: string): string[] {
  const configText = readFileSync(
    resolve(root, MIGRATIONS_PLUGIN_DIR, "drizzle.config.ts"),
    "utf-8",
  );
  const configRelativeGlobs = parseSchemaGlobs(configText);
  if (!configRelativeGlobs) {
    throw new Error("Could not parse schema globs from drizzle.config.ts");
  }
  const files = new Set<string>();
  for (const pattern of configRelativeGlobs) {
    const abs = resolve(root, MIGRATIONS_PLUGIN_DIR, pattern);
    const repoRelativeGlob = relative(root, abs);
    for (const match of new Bun.Glob(repoRelativeGlob).scanSync({ cwd: root })) {
      files.add(match);
    }
  }
  return [...files].sort();
}
