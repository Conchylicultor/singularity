import { cp, mkdtemp, rename, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { prototypesDir } from "../../data-dirs";
import { TEMPLATE_DIR_NAME, TEMPLATE_SEED_DIR } from "./paths";

/**
 * Copy the repo's `_template/` into the prototypes data dir, once.
 *
 * The template is the blank page every prototype starts from, and it is code —
 * it ships in the repo. The prototypes themselves are user content in
 * `~/.singularity/apps/prototypes/`. Seeding closes that gap: an agent copies a
 * sibling folder inside the data dir instead of reaching back into a checkout
 * that a release doesn't even have.
 *
 * Written temp-then-rename because every worktree backend runs this on boot
 * against the ONE shared dir: a half-copied `_template` must never be visible,
 * and the loser of the race must not corrupt the winner's. An existing template
 * is never overwritten — the user may have edited it, and re-seeding would
 * silently revert that.
 */
export async function seedTemplate(): Promise<void> {
  const dest = prototypesDir.file(TEMPLATE_DIR_NAME);
  if (existsSync(dest)) return;
  // Absent in a compiled release (REPO_ROOT is the binary's virtual FS).
  if (!existsSync(TEMPLATE_SEED_DIR)) return;

  const staging = await mkdtemp(prototypesDir.file(".template-staging-"));
  try {
    await cp(TEMPLATE_SEED_DIR, staging, { recursive: true });
    await rename(staging, dest);
  } catch (err) {
    await rm(staging, { recursive: true, force: true });
    // Losing the rename race is the expected concurrent outcome: another
    // backend seeded it first, which is exactly the desired end state.
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOTEMPTY" || code === "EEXIST") return;
    throw err;
  }
}
