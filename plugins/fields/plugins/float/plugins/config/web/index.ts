import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Fields } from "@plugins/config_v2/plugins/fields/web";
import { floatSample } from "../core";
import { FloatRenderer } from "./components/float-renderer";

export default {
  description:
    "Float field type: config-render capability (number stepper for config-v2.fields.renderer) plus the floatField factory.",
  contributions: [Fields.Renderer(FloatRenderer), Fields.Sample(floatSample)],
} satisfies PluginDefinition;
