import { z } from "zod";
import { blob, defineEndpoint } from "@plugins/infra/plugins/endpoints/core";
import { liveValue } from "@plugins/network/plugins/live/core";

export const IconSpritesSchema = z.object({
  /**
   * What the sprites are a function of: the manifest's names and the installed
   * Iconify sets. Every sprite URL carries it, which is what lets the route
   * serve them as immutable.
   */
  manifestHash: z.string(),
  /** Sprite key → a whole `<svg>…</svg>` of `<symbol>`s. */
  sprites: z.record(z.string(), z.string()),
});
export type IconSprites = z.infer<typeof IconSpritesSchema>;

/**
 * The RESIDENT sprites: the default style's two (at rest and active) plus the
 * brands. Preloaded, so the boot snapshot hydrates them before first paint and
 * no icon ever renders against a missing symbol in the default theme. A scope
 * themed to another style fetches that style's sprite from
 * {@link spriteEndpoint} on demand. External: the truth is the manifest compiled into this process
 * and node_modules, neither of which changes while it runs.
 */
export const residentSprites = liveValue("icons.sprites", {
  schema: IconSpritesSchema,
  preload: "boot-and-keep",
});

/**
 * One sprite (`image/svg+xml`), content-addressed by the manifest hash in its
 * path, so it is served immutable. `key` is a style key or `brands`.
 */
export const spriteEndpoint = defineEndpoint({
  route: "GET /api/icons/sprite/:hash/:key",
  response: blob("image/svg+xml"),
});
