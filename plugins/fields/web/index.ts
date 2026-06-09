import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { Fields } from "./slots";

export default {
  description:
    "Type-dimension registry: owns the fields.identity slot where each field type registers its identity (token, label, icon, extends, coerce).",
  contributions: [],
} satisfies PluginDefinition;
