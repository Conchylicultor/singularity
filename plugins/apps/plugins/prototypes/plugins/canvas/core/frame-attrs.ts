/**
 * The canvas's DOM contract for a driver OUTSIDE the app (an `e2e/` script,
 * which drives the deployed app and may import only `core` and `e2e` barrels).
 *
 * Every frame's screen — the box a script photographs — carries:
 *
 * - `data-canvas-frame="<letter>"` — A, B, C… in canvas order;
 * - `data-canvas-frame-kind="prototype"`, or the frame source's id
 *   (`real-app`) — the canvas names no source, it publishes the id it was given;
 * - `data-canvas-frame-status` — `loading`, `unresolved` or `found`, so a driver
 *   waits for `found` rather than photographing a spinner, and on `unresolved`
 *   reads the frame's own text for the reason.
 */

export const CANVAS_FRAME_ATTR = "data-canvas-frame";
export const CANVAS_FRAME_KIND_ATTR = "data-canvas-frame-kind";
export const CANVAS_FRAME_STATUS_ATTR = "data-canvas-frame-status";

/** The kind a prototype frame publishes; a source frame publishes its id. */
export const PROTOTYPE_FRAME_KIND = "prototype";

export type CanvasFrameStatus = "loading" | "unresolved" | "found";

/** CSS selector for frames, narrowed by letter, kind and/or status. */
export function canvasFrameSelector({
  letter,
  kind,
  status,
}: {
  letter?: string;
  kind?: string;
  status?: CanvasFrameStatus;
} = {}): string {
  let sel = `[${CANVAS_FRAME_ATTR}${letter === undefined ? "" : `="${letter}"`}]`;
  if (kind !== undefined) sel += `[${CANVAS_FRAME_KIND_ATTR}="${kind}"]`;
  if (status !== undefined) sel += `[${CANVAS_FRAME_STATUS_ATTR}="${status}"]`;
  return sel;
}
