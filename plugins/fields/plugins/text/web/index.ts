import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Fields } from "@plugins/fields/web";
import { textIdentity } from "../core";

export default {
  description:
    "Text field type: identity only. The data-view cell and filter (substring) capabilities live in the plugins/{table,filter} sub-plugins.",
  contributions: [Fields.Identity({ identity: textIdentity })],
} satisfies PluginDefinition;
