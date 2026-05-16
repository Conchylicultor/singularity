import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Fields } from "@plugins/config_v2/plugins/fields/web";
import { BoolRenderer } from "./components/bool-renderer";
import { TextRenderer } from "./components/text-renderer";
import { IntRenderer } from "./components/int-renderer";
import { FloatRenderer } from "./components/float-renderer";

export default {
  id: "config-v2-fields-primitives",
  name: "Config v2: Primitive Fields",
  description: "Basic field types: bool, text, int, float.",
  contributions: [
    Fields.Renderer(BoolRenderer),
    Fields.Renderer(TextRenderer),
    Fields.Renderer(IntRenderer),
    Fields.Renderer(FloatRenderer),
  ],
} satisfies PluginDefinition;
