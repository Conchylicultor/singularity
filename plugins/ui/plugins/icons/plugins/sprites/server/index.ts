import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { spriteEndpoint } from "../core";
import { handleSprite } from "./internal/handle-sprite";
import { residentSpritesServed } from "./internal/resident";

export default {
  description:
    "Builds the icon sprites from the Iconify JSON for the manifest's names — one <svg> of <symbol id=\"ms-<styleKey>-<name>\"> per style key (material-symbols at 400, material-symbols-light at 300) plus a brands sprite — and serves the default style's as the resident icons.sprites value and every one at GET /api/icons/sprite/:hash/:key, immutable.",
  contributions: [...residentSpritesServed.declare],
  httpRoutes: {
    [spriteEndpoint.route]: handleSprite,
  },
} satisfies ServerPluginDefinition;
