import { z } from "zod";
import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";
import { liveValue } from "@plugins/network/plugins/live/core";

/**
 * The shape of every Google API key: `AIza` plus 35 URL-safe characters. Checked
 * on write (server) and before enabling Save (web), so a pasted Places key's
 * neighbour — a client id, a secret, a stray space — is refused with a reason
 * instead of surfacing later as a blank map.
 */
export const BROWSER_KEY_PATTERN = /^AIza[0-9A-Za-z_-]{35}$/;

/**
 * What the user submits: the browser key. There is no Map ID: the renderer
 * styles the map inline, which Google only honours on a map without one.
 */
export const MapsBrowserConfigInputSchema = z.object({
  browserKey: z
    .string()
    .trim()
    .regex(BROWSER_KEY_PATTERN, "Not a Google API key (expected AIza…)"),
});
export type MapsBrowserConfigInput = z.infer<
  typeof MapsBrowserConfigInputSchema
>;

/**
 * The browser config as the live value carries it. `unset` is an answer (no
 * file on this machine), distinct from not-loaded-yet — which is the read's
 * `pending`, never a value.
 */
export const MapsBrowserConfigValueSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("unset") }),
  z.object({
    kind: z.literal("set"),
    browserKey: z.string(),
  }),
]);
export type MapsBrowserConfigValue = z.infer<
  typeof MapsBrowserConfigValueSchema
>;

/**
 * The host-global browser config, pushed to every tab of every checkout: the
 * server notifies on its own writes and on any out-of-band change to the file
 * (another checkout's write, a hand edit), via a file watcher.
 */
export const mapsBrowserConfig = liveValue("google-maps.browser-config", {
  schema: MapsBrowserConfigValueSchema,
});

/**
 * Store (or replace) the browser config.
 *
 * There is no server-side verification, unlike the Places key: a browser key is
 * restricted to HTTP referrers, and a request from the server either carries no
 * referrer (Google refuses it — a correct key would read as broken) or forges
 * one (which proves nothing about what a real browser will see). The renderer's
 * `gm_authFailure` callback, raised in the actual page against the actual
 * referrer, is the only honest verifier.
 */
export const setMapsBrowserConfig = defineEndpoint({
  route: "POST /api/google-maps/browser-config",
  body: MapsBrowserConfigInputSchema,
});

/** Remove the browser config, turning every live map back into its setup prompt. */
export const clearMapsBrowserConfig = defineEndpoint({
  route: "DELETE /api/google-maps/browser-config",
});
