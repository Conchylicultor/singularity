/**
 * The id compare contributes its canvas frame source under — the "Real app"
 * frame. The canvas names no source: it publishes the id a frame came from as
 * `data-canvas-frame-kind`, so this is the one spelling of it, read by the
 * contribution (`web/`) and by a driver outside the app that looks for the
 * real-app frame (`e2e/compare-diff.ts`, which may import `core` but never
 * `web`).
 */
export const REAL_APP_SOURCE = "real-app";

/**
 * The source's add label — the canvas header's `+ Real app` button. Spelled
 * here for the same reason: the e2e driver clicks that button to put the
 * real-app frame on the canvas.
 */
export const REAL_APP_LABEL = "Real app";
