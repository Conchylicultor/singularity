import { existsSync } from "node:fs";
import { cp, mkdtemp, rename, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { getWorktreeRoot } from "@plugins/infra/plugins/spawn/core";

// Getting a folder into the prototypes data dir: `mintPrototype()` copies the
// template, from the checkout that is running, into a freshly minted id.
//
// Kept out of `core/` because it touches `fs`, and out of `server/` because the
// CLI mints with no backend running — the same split `read-folder.ts` already
// makes.

/** The template's folder in the repo's `prototypes/`. */
export const TEMPLATE_DIR_NAME = "_template";

/** What {@link copyFolderOnce} found when it went to write. */
export type CopyFolderOutcome = "copied" | "already-there";

/**
 * Copy `src` to `dest`, never overwriting, atomically visible.
 *
 * Written temp-then-rename because every worktree backend and the CLI write
 * into the ONE shared dir: a half-copied folder must never be visible, and the
 * loser of a race must not corrupt the winner's. An existing destination is
 * never overwritten — the folder IS a prototype, and clobbering it would
 * destroy somebody's work.
 *
 * `prepare` edits the copy before it becomes visible — the mint stamps the
 * title there, so a new prototype never exists without it (and its `v0` is the
 * titled page, whoever records it first).
 *
 * Returns which of the two happened rather than a bare boolean: the mint treats
 * `already-there` as a collision and draws another id.
 */
export async function copyFolderOnce(
  src: string,
  dest: string,
  opts: { prepare?: (staging: string) => Promise<void> } = {},
): Promise<CopyFolderOutcome> {
  if (existsSync(dest)) return "already-there";

  const staging = await mkdtemp(join(dirname(dest), ".staging-"));
  try {
    await cp(src, staging, { recursive: true });
    await opts.prepare?.(staging);
    await rename(staging, dest);
  } catch (err) {
    await rm(staging, { recursive: true, force: true });
    // Losing the rename race is the expected concurrent outcome: somebody else
    // wrote `dest` first — the collision the mint re-draws around.
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOTEMPTY" || code === "EEXIST") return "already-there";
    throw err;
  }
  return "copied";
}

/**
 * Absolute path of the blank template a mint copies: `prototypes/_template/`
 * in the checkout that is RUNNING — main's app mints from main's template, a
 * worktree's deploy (or CLI) from its own branch's.
 *
 * The template is code: reviewed, versioned, and read where it lives. There is
 * deliberately no copy of it in the data dir — a copy seeded once and never
 * overwritten is how every template change after the seed silently stopped
 * reaching new prototypes.
 *
 * Reaches the checkout through `getWorktreeRoot()` rather than `REPO_ROOT`:
 * that constant lives in `paths/server`, which `shared/` may not import, and
 * this plugin's `check/index.ts` already resolves the repo the same way.
 *
 * Throws when the checkout has no template — a mint with nothing to copy has
 * no empty-but-fine answer to return.
 */
export async function templateDir(): Promise<string> {
  const dir = join(await getWorktreeRoot(), "prototypes", TEMPLATE_DIR_NAME);
  if (!existsSync(dir)) {
    throw new Error(`no prototype template to copy: ${dir} does not exist`);
  }
  return dir;
}
