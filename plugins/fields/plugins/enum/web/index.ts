import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Fields } from "@plugins/fields/web";
import { enumIdentity } from "../core";

export default {
  name: "Fields: Enum",
  description:
    "Enum (select) field type: identity only. The config-render, table (chip cell), and filter (multi-select) capabilities live in the plugins/{config,table,filter} sub-plugins.",
  contributions: [Fields.Identity({ identity: enumIdentity })],
} satisfies PluginDefinition;
