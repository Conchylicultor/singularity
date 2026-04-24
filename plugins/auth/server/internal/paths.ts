import { homedir } from "node:os";
import path from "node:path";

const SINGULARITY_DIR = path.join(homedir(), ".singularity");

export const SOCKET_PATH = path.join(SINGULARITY_DIR, "auth.sock");
export const WORKTREES_DIR = path.join(SINGULARITY_DIR, "worktrees");

export const MAIN_WORKTREE_NAME = "singularity";

export function isMain(): boolean {
  return process.env.SINGULARITY_WORKTREE === MAIN_WORKTREE_NAME;
}

export function currentWorktreeName(): string | undefined {
  return process.env.SINGULARITY_WORKTREE;
}
