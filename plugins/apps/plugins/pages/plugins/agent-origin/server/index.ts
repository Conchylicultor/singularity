import { Resource } from "@plugins/framework/plugins/server-core/core";
import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { BlockLifecycle } from "@plugins/page/plugins/editor/server";
import { agentOriginCreateHook } from "./internal/create-hook";
import { agentPagesServerResource } from "./internal/resource";
import { agentPagesSweep } from "./internal/sweep";

export { pageBlocksOrigin } from "./internal/tables";
export { agentPagesServerResource } from "./internal/resource";

export default {
  description:
    "Agent-origin provenance for pages (page_blocks_ext_origin): a create-hook contributor stamps every page written by an automated session (x-singularity-origin: agent) with the script that minted it, a bounded live resource exposes the marker set to the Pages sidebar's `origin` field, and a 24h retention sweep trashes the marked pages.",
  // The sweep declares `schedule` — the jobs worker seeds its cron item at
  // startup, so no onReady enqueue is needed.
  register: [agentPagesSweep],
  contributions: [
    Resource.Declare(agentPagesServerResource),
    // Stamps the marker after the block row lands. The editor dispatches this
    // generically and never names this plugin — which is the whole reason the
    // hook exists (an inline stamp would make the editor import us back, a cycle).
    BlockLifecycle.AfterCreate(agentOriginCreateHook),
  ],
} satisfies ServerPluginDefinition;
