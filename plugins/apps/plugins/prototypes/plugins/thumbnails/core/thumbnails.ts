import { z } from "zod";
import { resourceDescriptor } from "@plugins/primitives/plugins/live-state/core";

/**
 * Why a render produced no picture. Every arm is a state the card renders, not
 * an error swallowed into a missing image:
 *
 * - `subresource-failed` — a script or stylesheet the page needs never loaded
 *   (offline, dead CDN). The page technically rendered; what it rendered is a
 *   lie about the prototype, so it is never cached.
 * - `blank-page` — the document loaded but painted nothing (a prototype that
 *   throws on boot). Same reasoning.
 * - `render-timeout` — the page never settled inside the budget. A partial
 *   screenshot is indistinguishable from a finished one, so we take none.
 * - `browser-unavailable` — chromium could not be launched at all.
 */
export const ThumbnailFailureKindSchema = z.enum([
  "subresource-failed",
  "blank-page",
  "render-timeout",
  "browser-unavailable",
]);
export type ThumbnailFailureKind = z.infer<typeof ThumbnailFailureKindSchema>;

/**
 * One prototype's thumbnail state.
 *
 * `key` is the content fingerprint the state describes — present on `ready`
 * (it addresses the cached PNG) *and* on `failed`, so a permanently broken
 * prototype is not re-rendered on every unrelated edit: the sync compares the
 * folder's current fingerprint against the one that already failed.
 */
export const ThumbnailStateSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("ready"), key: z.string() }),
  z.object({ status: z.literal("rendering") }),
  z.object({
    status: z.literal("failed"),
    key: z.string(),
    kind: ThumbnailFailureKindSchema,
    message: z.string(),
  }),
]);
export type ThumbnailState = z.infer<typeof ThumbnailStateSchema>;

/**
 * Thumbnail state for every prototype, keyed by directory slug. Push-based: the
 * render job notifies on completion, so a card updates itself with no polling.
 * A prototype absent from the map has no state yet (nothing has looked at it,
 * or the backend just booted) — which the card renders as its fallback cover,
 * the same as `rendering`.
 */
export const prototypeThumbnailsResource = resourceDescriptor<
  Record<string, ThumbnailState>
>("prototypes.thumbnails", z.record(z.string(), ThumbnailStateSchema), {});

/** Base path for the cached-PNG route. */
export const PROTOTYPE_THUMBS_BASE = "/api/prototype-thumbs";

/**
 * Route key for one cached thumbnail.
 *
 * Deliberately NOT under `/api/prototypes/…`: that prefix already owns
 * `GET /api/prototypes/:name/:file`, which matches any two segments, so a
 * thumbnail nested under it would be shadowed by (or shadow) raw file serving.
 * Raw handler — it returns image bytes, which `implement()`'s JSON contract
 * does not fit.
 */
export const PROTOTYPE_THUMB_ROUTE = `GET ${PROTOTYPE_THUMBS_BASE}/:key`;

/**
 * URL for a rendered thumbnail. The path carries the content fingerprint, so
 * the response is genuinely immutable — an edit yields a different URL rather
 * than a stale hit, and the browser never has to revalidate.
 */
export function prototypeThumbnailUrl(key: string): string {
  return `${PROTOTYPE_THUMBS_BASE}/${key}.png`;
}
