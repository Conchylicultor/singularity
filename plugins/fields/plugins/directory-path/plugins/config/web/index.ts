import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Fields } from "@plugins/config_v2/plugins/fields/web";
import { DirPathRenderer } from "./components/dir-path-renderer";

export default {
  description:
    "Directory-path field type: config-render capability (folder picker for config-v2.fields.renderer) plus the dirPathField factory.",
  contributions: [Fields.Renderer(DirPathRenderer)],
} satisfies PluginDefinition;
