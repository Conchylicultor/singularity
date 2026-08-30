import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { PageTree } from "@plugins/apps/plugins/pages/plugins/page-tree/web";
import { OriginField } from "./components/origin-field";

export { agentPagesResource, AgentPageRowSchema } from "../shared/resources";
export type { AgentPageRow } from "../shared/resources";

export default {
  description:
    "Agent-origin provenance for pages: contributes an `origin` enum field (Mine / Agent) into the Pages sidebar DataView, so pages written by an automated session segregate into their own `[Agent]` section of the tree.",
  contributions: [
    PageTree.Fields({ id: "origin", section: null, component: OriginField }),
  ],
} satisfies PluginDefinition;
