import {
  useResource,
  type ResourceResult,
} from "@plugins/primitives/plugins/live-state/web";
import { prototypeThumbnailsResource, type ThumbnailState } from "../core";

/**
 * Thumbnail state for every prototype, keyed by directory slug.
 *
 * Exported as a hook, rather than hidden inside the card, so the surface that
 * owns the cards subscribes at the SAME moment it subscribes to the list they
 * come from. That ordering is the whole point: a resource primes over HTTP when
 * its first subscriber mounts, so a card that fetched its own picture could only
 * ever start that request AFTER the list it belongs to had already painted — one
 * guaranteed round trip of stand-in cover on every single load, which is exactly
 * the flicker (gradient, then screenshot) this replaces.
 *
 * Gate the cards on this together with the list (`combineResources`) and the
 * cover is right the first time it is painted.
 */
export function usePrototypeThumbnails(): ResourceResult<
  Record<string, ThumbnailState>
> {
  return useResource(prototypeThumbnailsResource);
}
