import { join } from "node:path";
import { SINGULARITY_DIR } from "@plugins/infra/plugins/paths/server";

const worktree = process.env.SINGULARITY_WORKTREE;
if (!worktree) {
  throw new Error(
    "SINGULARITY_WORKTREE must be set — config_v2 requires a worktree identity",
  );
}

export const CONFIG_DIR = join(SINGULARITY_DIR, "config", worktree);
