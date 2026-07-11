import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";

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
