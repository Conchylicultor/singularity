import {
  Core,
  type PluginDefinition,
} from "@plugins/framework/plugins/web-sdk/core";
import { IconSpriteHost } from "./internal/sprite-host";

export default {
  description:
    "Mounts the page's icon sprites inline: the resident default-style sprites from the boot snapshot (present at first paint) plus, on demand, the sprite of every other style a theme scope picks.",
  contributions: [Core.Root({ component: IconSpriteHost })],
} satisfies PluginDefinition;
