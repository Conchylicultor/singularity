import { existsSync } from "node:fs";
import { prototypesDir } from "../../data-dirs";
import { copyFolderOnce, TEMPLATE_DIR_NAME } from "../../shared/template";
import { TEMPLATE_SEED_DIR } from "./paths";

/**
 * Copy the repo's `_template/` into the prototypes data dir, once, on boot.
 *
 * The template is the blank page every prototype starts from, and it is code —
 * it ships in the repo. The prototypes themselves are user content in
 * `~/.singularity/apps/prototypes/`. Seeding closes that gap: a mint copies a
 * sibling folder inside the data dir instead of reaching back into a checkout
 * that a release doesn't even have.
 *
 * The never-overwrite rule and the temp-then-rename race handling live in
 * {@link copyFolderOnce}, which `mintPrototype()` shares — the two writers into
 * this directory get one set of semantics, not two.
 */
export async function seedTemplate(): Promise<void> {
  const dest = prototypesDir.file(TEMPLATE_DIR_NAME);
  if (existsSync(dest)) return;
  // Absent in a compiled release (REPO_ROOT is the binary's virtual FS).
  if (!existsSync(TEMPLATE_SEED_DIR)) return;

  await copyFolderOnce(TEMPLATE_SEED_DIR, dest);
}
