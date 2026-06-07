import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Fields } from "@plugins/fields/web";
import { dateIdentity } from "../core";

export default {
  name: "Fields: Date",
  description:
    "Date field type: identity only. The data-view cell (relative time) and filter (date range) capabilities live in the plugins/{table,filter} sub-plugins.",
  contributions: [Fields.Identity({ identity: dateIdentity })],
} satisfies PluginDefinition;
