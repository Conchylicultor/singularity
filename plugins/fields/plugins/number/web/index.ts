import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Fields } from "@plugins/fields/web";
import { numberIdentity } from "../core";

export default {
  name: "Fields: Number",
  description:
    "Number field type: identity only. The data-view cell and filter (min/max) capabilities live in the plugins/{table,filter} sub-plugins.",
  contributions: [Fields.Identity({ identity: numberIdentity })],
} satisfies PluginDefinition;
