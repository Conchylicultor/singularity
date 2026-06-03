import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Fields } from "@plugins/config_v2/plugins/fields/web";
import { MultilineTextRenderer } from "./components/multiline-text-renderer";

export default {
  name: "Config v2: Multi-line Text Field",
  description: "Multi-line text field type.",
  contributions: [Fields.Renderer(MultilineTextRenderer)],
} satisfies PluginDefinition;
