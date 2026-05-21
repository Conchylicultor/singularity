import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Fields } from "@plugins/config_v2/plugins/fields/web";
import { AvatarRenderer } from "./components/avatar-renderer";

export default {
  id: "config-v2-fields-avatar",
  name: "Config v2: Avatar Field",
  description: "Avatar field type (icon + color picker).",
  contributions: [Fields.Renderer(AvatarRenderer)],
} satisfies PluginDefinition;
