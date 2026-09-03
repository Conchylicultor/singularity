import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";

// The directory the latch lives in, declared in this plugin's `data-dirs/`.
// Surfaced here for the ONE consumer that must watch it rather than read it:
// the CLI's admission valve puts an `fs.watch` on it so a duress clear wakes a
// held build immediately, with no poll loop.
export { duressLatchDir } from "../data-dirs";

export {
  clearDuress,
  duressEpisode,
  FRESHNESS_LEASE_MS,
  isUnderDuress,
  LATCH_FILENAME,
  MEMO_TTL_MS,
  readDuress,
  refreshDuress,
  setDuress,
  _setClockForTests,
  _setLatchDirForTests,
} from "./internal/latch";
export type { DuressLatch } from "./internal/latch";

export default {
  description:
    "The host-global duress latch file (mtime-leased, set/refresh/clear by the cluster sentinel, read via the cheap synchronous isUnderDuress()). A leaf on purpose: module-eval depends only on node:fs + infra/paths — no config, no DB, no worktree identity — so env-independent processes (the CLI's build admission valve) can import it safely.",
} satisfies ServerPluginDefinition;
