import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Fields } from "@plugins/fields/web";
import { reorderTreeIdentity } from "../core";

export default {
  description:
    "Reorder-tree field type: identity only. The config-render capability and the reorderTreeField factory live in the plugins/config sub-plugin.",
  contributions: [Fields.Identity({ identity: reorderTreeIdentity })],
} satisfies PluginDefinition;
