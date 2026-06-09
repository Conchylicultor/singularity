import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Fields } from "@plugins/fields/web";
import { boolIdentity } from "../core";

export default {
  description:
    "Boolean field type: identity only. The data-view cell (check/cross) and filter (yes/no) capabilities live in the plugins/{table,filter} sub-plugins.",
  contributions: [Fields.Identity({ identity: boolIdentity })],
} satisfies PluginDefinition;
