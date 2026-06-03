/**
 * `@plugins/infra/plugins/asset-mirror/core` — public, browser-safe surface.
 *
 * The asset-mirror primitive lazily mirrors a remote asset source to local disk
 * and serves it same-origin (offline-capable after one warm-up). This barrel
 * exposes only the URL helper web code needs to point a consumer at the mirror;
 * the server barrel owns `defineAssetMirror` (the registration token).
 */

export { ASSET_MIRROR_PREFIX, assetMirrorUrl } from "./url";
