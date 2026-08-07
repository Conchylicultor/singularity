// The two drivers over the changed set: one that WRITES (build,
// `./singularity format`) and one that never does (the `format-clean` check).
// Both read the same set from `changed-files.ts` and format through the same
// `formatSource`, so they cannot disagree about what "formatted" means.

import { readFile, writeFile } from "fs/promises";
import { join } from "path";
import { listChangedFormattableFiles } from "./changed-files";
import {
  findDirectiveDisplacements,
  formatDirectiveDisplacementReport,
  type DirectiveDisplacement,
} from "./directive-displacement";
import { formatSource } from "./prettier";

/**
 * Read → format → compare. NEVER writes. Returns the subset of `files` (paths
 * relative to `root`) whose on-disk bytes differ from prettier's output.
 */
export async function findUnformatted(
  root: string,
  files: string[],
): Promise<string[]> {
  const unformatted: string[] = [];
  for (const rel of files) {
    const source = await readFile(join(root, rel), "utf8");
    if ((await formatSource(rel, source)) !== source) unformatted.push(rel);
  }
  return unformatted;
}

/**
 * Read → format → compare DIRECTIVE TARGETS. NEVER writes. The read-only twin
 * of the gate inside {@link formatChangedSources}, for the
 * `lint-directives-stable` check.
 *
 * Note what it is a function of: the files as they are ON DISK. A displacement
 * exists only while a file is still unformatted — once the build has written
 * the formatted bytes, `formatSource` is the identity and there is nothing left
 * to compare. That is exactly why this cannot be the primary defense: it is
 * structurally green the moment the damage has landed. The gate in
 * `formatChangedSources` is what stops it landing; this is the surface that
 * names the problem on the `push`/standalone-check path, which never builds.
 */
export async function findDisplacedDirectives(
  root: string,
  files: string[],
): Promise<DirectiveDisplacement[]> {
  const displaced: DirectiveDisplacement[] = [];
  for (const rel of files) {
    const source = await readFile(join(root, rel), "utf8");
    const next = await formatSource(rel, source);
    displaced.push(...(await findDirectiveDisplacements(rel, source, next)));
  }
  return displaced;
}

/**
 * Read → format → write-iff-different, over the branch's changed set. Returns
 * the paths actually rewritten.
 *
 * Three properties are load-bearing:
 *
 * - **Write only on byte difference.** Web artifacts are fingerprinted on
 *   `(mtimeMs, size)`, so an unconditional write would invalidate an artifact
 *   whose bytes never changed. It is also what makes the pass cheap after a
 *   branch's first build (0–3 files touched).
 * - **Re-read immediately before writing.** The build lock serializes builds,
 *   not the agent's editor. An edit landing mid-pass would otherwise be
 *   clobbered by bytes derived from a stale read, so a file whose bytes moved
 *   since the read is skipped and logged rather than overwritten.
 * - **Refuse to write a change that displaces a positional lint directive.**
 *   This is the ONLY place in the repo that holds both the pre- and post-format
 *   bytes of a file, so it is the only place that can see a
 *   `// eslint-disable-next-line` change what it suppresses. Write the bytes and
 *   the evidence is gone: a widened directive then silently hides violations
 *   nobody vetted, and every later gate is structurally green. So the displacing
 *   files are left untouched and the whole pass THROWS at the end — an agent is
 *   forced to fix the directive explicitly rather than discover it later.
 *
 * The throw comes after the loop, not at the first offender: every displacement
 * in the changed set is reported at once, so a fix is one pass rather than one
 * build per site. Non-displacing files are still written — formatting is
 * idempotent and per-file, so partial progress needs no rollback.
 */
export async function formatChangedSources(opts: {
  root: string;
  log?: (line: string) => void;
}): Promise<{ formatted: string[] }> {
  const { root, log } = opts;
  const files = await listChangedFormattableFiles(root);
  const formatted: string[] = [];
  const displaced: DirectiveDisplacement[] = [];

  for (const rel of files) {
    const abs = join(root, rel);
    const source = await readFile(abs, "utf8");
    const next = await formatSource(rel, source);
    if (next === source) continue;

    const moved = await findDirectiveDisplacements(rel, source, next);
    if (moved.length > 0) {
      displaced.push(...moved);
      log?.(
        `format: REFUSED ${rel} — formatting would displace ${moved.length} lint directive(s)`,
      );
      continue;
    }

    const current = await readFile(abs, "utf8");
    if (current !== source) {
      log?.(`format: skipped ${rel} — changed on disk during the pass`);
      continue;
    }

    await writeFile(abs, next, "utf8");
    formatted.push(rel);
    log?.(`format: rewrote ${rel}`);
  }

  if (displaced.length > 0) {
    throw new Error(formatDirectiveDisplacementReport(displaced));
  }

  return { formatted };
}
