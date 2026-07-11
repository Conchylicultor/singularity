import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { ConfigV2 } from "@plugins/config_v2/server";
import { duressConfig } from "../core";

// The latch itself lives in the `latch` leaf sub-plugin — import it from
// @plugins/infra/plugins/duress/plugins/latch/server. Its module-eval is
// env-independent (node:fs + paths only) so the CLI can import it, while this
// barrel drags config_v2 via the shed engine; re-exporting it here would both
// hide that dependency split and violate the no-cross-plugin-re-export rule.
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
