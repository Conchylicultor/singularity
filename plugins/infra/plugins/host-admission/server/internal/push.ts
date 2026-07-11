import { join } from "node:path";
import { SINGULARITY_DIR } from "@plugins/infra/plugins/paths/server";
import { defineHostPool } from "./pool";

// The global push mutex, folded onto the host-pool primitive. `size 1` ⇒ at most
// one push runs host-wide; `cost.cpu 0` because a push waits on git/network, not
// CPU (it takes a CPU grant separately, for its nested checks). Its single slot
// file — `~/.singularity/push-slots/slot-0.lock` — is the SAME file
// `worktree-op.ts`'s `PUSH_LOCK_PATH` probes, so the op-status derivation reads
// the authoritative kernel flock the CLI holds. Keep the two paths identical.
export const pushPool = defineHostPool({ id: "push", size: 1, cost: { cpu: 0 } });

/**
 * The push pool's single slot file. Exported so the worktree op-status probe and
 * this pool can be asserted to target the identical path.
 */
export const PUSH_SLOT_PATH = join(SINGULARITY_DIR, "push-slots", "slot-0.lock");
