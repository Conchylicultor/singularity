import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
// Side-effect registration only: eagerly registers the boot-critical
// conversation-groups web descriptor (see ./internal/register). The grouped plugin
// is the schema/resource/CRUD layer — its UI lives in data-view/plugins/grouped.
import "./internal/register";

export default {
  collapsed: true,
  description:
    "grouped web presence: eagerly registers the boot-critical conversation-groups resource descriptor so boot-snapshot can hydrate it before first paint, independent of the (lazy) DataView Grouped tab.",
  contributions: [],
} satisfies PluginDefinition;
