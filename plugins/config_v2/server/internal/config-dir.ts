import { configDir } from "../../data-dirs";

const worktree = process.env.SINGULARITY_WORKTREE;
if (!worktree) {
  throw new Error(
    "SINGULARITY_WORKTREE must be set — config_v2 requires a worktree identity",
  );
}

/** This worktree's subtree of the declared user-config directory. */
export const CONFIG_DIR = configDir.file(worktree);
