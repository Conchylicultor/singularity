import type { DbSource } from "./context";
import { tracesSource } from "./traces";
import { slowOpsSource } from "./slow-ops";
import { reportsSource } from "./reports";
import { buildsSource } from "./builds";

// The closed list of DB-backed sources visited per fork DB, in emission
// order. Disk-backed sources (boot, health) are per-worktree-log-dir, not
// per-DB — see the fan-out runner.
export const DB_SOURCES: readonly DbSource[] = [
  tracesSource,
  slowOpsSource,
  reportsSource,
  buildsSource,
];
