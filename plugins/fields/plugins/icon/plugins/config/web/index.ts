import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Fields } from "@plugins/config_v2/plugins/fields/web";
import { iconSample } from "../core";
import { IconRenderer } from "./components/icon-renderer";

export default {
  description:
    "Icon field type: config-render capability (icon picker popover for config-v2.fields.renderer) plus the iconField factory.",
  contributions: [Fields.Renderer(IconRenderer), Fields.Sample(iconSample)],
} satisfies PluginDefinition;
