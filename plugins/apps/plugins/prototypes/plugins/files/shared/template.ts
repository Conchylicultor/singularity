import { existsSync } from "node:fs";
import { cp, mkdtemp, rename, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { getWorktreeRoot } from "@plugins/infra/plugins/spawn/core";
import { prototypesDir } from "../data-dirs";

// Getting a folder into the prototypes data dir, for the two callers that do it:
// `seedTemplate()` on boot (the repo's `_template/` → the data dir) and
// `mintPrototype()` (the seeded template → a freshly minted id).
//
// Kept out of `core/` because it touches `fs`, and out of `server/` because the
// CLI mints with no backend running — the same split `read-folder.ts` already
// makes.

/** The template's name in the repo AND in the data dir — skipped by the lister, like any `_` dir. */
export const TEMPLATE_DIR_NAME = "_template";

/** What {@link copyFolderOnce} found when it went to write. */
export type CopyFolderOutcome = "copied" | "already-there";

/**
 * Copy `src` to `dest`, never overwriting, atomically visible.
 *
 * Written temp-then-rename because every worktree backend does this on boot
 * against the ONE shared dir: a half-copied folder must never be visible, and
 * the loser of the race must not corrupt the winner's. An existing destination
 * is never overwritten — for the template, the user may have edited it and
 * re-seeding would silently revert that; for a minted id, the folder IS the
 * prototype and clobbering it would destroy somebody's work.
 *
 * Returns which of the two happened rather than a bare boolean, because the
 * callers act on it differently: seeding treats `already-there` as the desired
 * end state, minting treats it as a collision and draws another id.
 */
export async function copyFolderOnce(
  src: string,
  dest: string,
): Promise<CopyFolderOutcome> {
  if (existsSync(dest)) return "already-there";

  const staging = await mkdtemp(join(dirname(dest), ".staging-"));
  try {
    await cp(src, staging, { recursive: true });
    await rename(staging, dest);
  } catch (err) {
    await rm(staging, { recursive: true, force: true });
    // Losing the rename race is the expected concurrent outcome: somebody else
    // wrote `dest` first, which for a seed is exactly the desired end state and
    // for a mint is the collision the caller re-draws around.
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOTEMPTY" || code === "EEXIST") return "already-there";
    throw err;
  }
  return "copied";
}

/**
 * Absolute path of the template inside the data dir — the blank page a mint
 * copies — seeding it from the checkout first if it isn't there yet.
 *
 * The SEEDED copy is the source of a mint, not the repo's, so minting works in a
 * compiled release and so an edit the user made to the template is what new
 * prototypes inherit. The seed-on-demand arm is for the CLI on a fresh host:
 * `./singularity prototype new` must work before any backend has ever booted,
 * and boot is the only other thing that seeds.
 *
 * Reaches the checkout through `getWorktreeRoot()` rather than `REPO_ROOT`:
 * that constant lives in `paths/server`, which `shared/` may not import, and
 * this plugin's `check/index.ts` already resolves the repo the same way.
 *
 * Throws when neither copy exists — a mint with no template to copy has no
 * empty-but-fine answer to return.
 */
export async function seededTemplateDir(): Promise<string> {
  prototypesDir.ensure();
  const seeded = prototypesDir.file(TEMPLATE_DIR_NAME);
  if (existsSync(seeded)) return seeded;

  const fromCheckout = join(
    await getWorktreeRoot(),
    "prototypes",
    TEMPLATE_DIR_NAME,
  );
  if (!existsSync(fromCheckout)) {
    throw new Error(
      `no prototype template to copy: neither ${seeded} nor ${fromCheckout} exists`,
    );
  }
  await copyFolderOnce(fromCheckout, seeded);
  return seeded;
}
