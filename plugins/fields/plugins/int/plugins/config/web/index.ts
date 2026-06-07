import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Fields } from "@plugins/config_v2/plugins/fields/web";
import { IntRenderer } from "./components/int-renderer";

export default {
  name: "Fields: Integer Config",
  description:
    "Integer field type: config-render capability (number stepper for config-v2.fields.renderer) plus the intField factory.",
  contributions: [Fields.Renderer(IntRenderer)],
} satisfies PluginDefinition;
