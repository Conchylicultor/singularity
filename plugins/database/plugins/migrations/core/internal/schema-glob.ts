import { SCHEMA_GLOBS } from "./schema-glob-patterns";

/**
 * Enumerate the schema-glob files drizzle-kit discovers, from the SAME constant
 * drizzle.config.ts builds its `schema:` array out of. Returns sorted repo-relative
 * paths — the form `Bun.Glob` / `git grep` report.
 *
 * This used to read drizzle.config.ts as TEXT and regex the array out, which could
 * silently return a SUBSET (a `schema: [` in prose, a `]` inside a glob character class,
 * a non-literal element) — the checks would then inspect fewer files than drizzle-kit and
 * keep passing. There is no parse any more.
 */
export function schemaGlobFiles(root: string): string[] {
  const files = new Set<string>();
  for (const pattern of SCHEMA_GLOBS) {
    for (const match of new Bun.Glob(pattern).scanSync({ cwd: root })) files.add(match);
  }
  return [...files].sort();
}
