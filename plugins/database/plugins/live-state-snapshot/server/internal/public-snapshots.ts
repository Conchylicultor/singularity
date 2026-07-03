import { db } from "@plugins/database/server";
import {
  readPersistedSnapshots as readPersistedSnapshotsImpl,
  clearPersistedSnapshots as clearPersistedSnapshotsImpl,
} from "./persist";

// Singleton-bound public wrappers for the two barrel-exported consumers
// (`readPersistedSnapshots` used by boot-snapshot, `clearPersistedSnapshots` by
// boot-bench). They keep the public `(keys) => …` signature while the underlying
// `persist.ts` fns are db-parametrized. The `db` singleton import lives HERE (a
// backend-only file, imported solely through the barrel) — never in `persist.ts`
// itself, so a test importing `persist.ts` directly never triggers the
// SINGULARITY_WORKTREE-at-import throw in `@plugins/database/server`. Kept out of
// the barrel `index.ts` because barrel-purity (R3) forbids top-level `const`.
export const readPersistedSnapshots = (
  keys: string[],
): Promise<Map<string, unknown>> => readPersistedSnapshotsImpl(db, keys);

export const clearPersistedSnapshots = (keys: string[]): Promise<number> =>
  clearPersistedSnapshotsImpl(db, keys);
