/**
 * Identity of the piano's sample mirror, shared by this plugin's web voices
 * (which build smplr's `baseUrl` from it) and its server barrel (which registers
 * the mirror). Plugin-private DRY — lives in `shared/`, never imported
 * cross-plugin. A plugin naming its own mirror is fine; the asset-mirror
 * primitive stays generic and never names the piano.
 */

/** Mirror id → URL segment `/api/asset-mirror/splendid-grand-piano/…`. */
export const PIANO_MIRROR_ID = "splendid-grand-piano";

/**
 * smplr's default `SplendidGrandPiano` sample CDN. The asset-mirror primitive
 * fetches `<base>/<sample>.<format>` (e.g. `PP%20C%231.ogg`) on demand and
 * caches it locally, so the browser only ever talks to the local server.
 */
export const PIANO_REMOTE_BASE =
  "https://smpldsnds.github.io/sfzinstruments-splendid-grand-piano/samples";
