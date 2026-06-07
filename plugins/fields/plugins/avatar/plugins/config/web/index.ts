import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Fields } from "@plugins/config_v2/plugins/fields/web";
import { AvatarRenderer } from "./components/avatar-renderer";

export default {
  name: "Fields: Avatar Config",
  description:
    "Avatar field type: config-render capability (icon + color picker for config-v2.fields.renderer) plus the avatarField factory.",
  contributions: [Fields.Renderer(AvatarRenderer)],
} satisfies PluginDefinition;
