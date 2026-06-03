/**
 * URL shape shared by the asset-mirror primitive's web consumers and its server
 * route. Single source of truth for the `/api/asset-mirror/<id>/<file>` path so
 * the helper that web code calls and the route the server registers can never
 * drift apart.
 */

/** Route prefix. The server registers `${ASSET_MIRROR_PREFIX}/:id/:file`. */
export const ASSET_MIRROR_PREFIX = "/api/asset-mirror";

/**
 * Same-origin base URL for a registered mirror's files: append `/<file>` to
 * fetch a single file. Hand this to any consumer that fetches `<base>/<name>`
 * (e.g. an audio sampler's `baseUrl`); the server lazily mirrors each file from
 * the registered remote source and serves it locally thereafter.
 */
export function assetMirrorUrl(id: string): string {
  return `${ASSET_MIRROR_PREFIX}/${id}`;
}
