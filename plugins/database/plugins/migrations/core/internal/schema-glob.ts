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
    for (const match of new Bun.Glob(pattern).scanSync({ cwd: root }))
      files.add(match);
  }
  return [...files].sort();
}

/**
 * Same result as `schemaGlobFiles`, off the check runner's shared thread.
 * `Bun.Glob#scanSync` blocks the thread for the whole filesystem walk; every
 * other check in a `./singularity check` pass shares that one thread, so a
 * blocking glob here stalls the whole pass (checks/CLAUDE.md's stall watch).
 * `Bun.Glob#scan()` (no `Sync`) returns an `AsyncIterableIterator<string>` —
 * same filesystem-glob semantics (gitignored files included, matching what
 * drizzle-kit itself discovers), just non-blocking. Prefer this from any NEW
 * check-time caller; `schemaGlobFiles` stays for `schema-files-loadable`,
 * which still calls it synchronously (out of this change's scope — see the
 * MISC agent's report for why it wasn't converted here too).
 */
export async function schemaGlobFilesAsync(root: string): Promise<string[]> {
  const files = new Set<string>();
  for (const pattern of SCHEMA_GLOBS) {
    for await (const match of new Bun.Glob(pattern).scan({ cwd: root }))
      files.add(match);
  }
  return [...files].sort();
}
