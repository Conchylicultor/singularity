import { defineHostPool } from "./pool";

// The global push mutex, folded onto the host-pool primitive. `size 1` ⇒ at most
// one push runs host-wide; `cost.cpu 0` because a push waits on git/network, not
// CPU (it takes a CPU grant separately, for its nested checks). Its single slot
// file is the SAME file `worktree-op.ts`'s push probe reads, so the op-status
// derivation reads the authoritative kernel flock the CLI holds.
export const pushPool = defineHostPool({
  id: "push",
  size: 1,
  cost: { cpu: 0 },
});

/**
 * The push pool's single slot file.
 *
 * A FUNCTION, and read off the pool's own declared directory rather than
 * rebuilt: that is what makes "this path equals the pool's slot-0" true by
 * construction instead of by a comment asking two files to stay in sync. It also
 * keeps the path resolved on each read, since the data root is env-overridable.
 */
export function pushSlotPath(): string {
  return pushPool.slots.file("slot-0.lock");
}
