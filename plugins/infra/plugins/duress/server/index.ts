import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { ConfigV2 } from "@plugins/config_v2/server";
import { duressConfig } from "../core";

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
} from "./internal/latch";
export type { DuressLatch } from "./internal/latch";
export { createShedBuffer } from "./internal/shed-buffer";
export type {
  ShedBuffer,
  ShedBufferOptions,
  ShedCascadeStats,
  ShedSummary,
} from "./internal/shed-buffer";

export default {
  description:
    "Host-global duress latch (a mtime-leased latch file the cluster sentinel sets while the box is in trouble; backends gate observability writes on the cheap synchronous isUnderDuress()) plus the shed engine: createShedBuffer routes durable observability writes through per-episode first-N persistence, a bounded in-memory buffer, and a flush-on-clear replay.",
  contributions: [ConfigV2.Register({ descriptor: duressConfig })],
} satisfies ServerPluginDefinition;
