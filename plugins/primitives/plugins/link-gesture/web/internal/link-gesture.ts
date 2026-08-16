import type { MouseEvent } from "react";

/**
 * Handler props that give any control the browser's own link gestures:
 *
 *   • plain click                 → open it HERE
 *   • ⌘/Ctrl-click, middle-click  → open it ELSEWHERE, staying put
 *
 * Spread onto the control; `open` receives which one the user asked for:
 *
 * ```tsx
 * <IconButton icon={MdOpenInFull} label="Expand pane" {...linkGestureProps(go)} />
 * ```
 *
 * **Why this is not free.** The browser grants these gestures to `<a href>`
 * only — an anchor pointing at a document. A `<button>` gets none of them, so
 * a control that navigates has to read them itself. Doing that once, here, is
 * what keeps every such control agreeing on what a ⌘-click means.
 *
 * `Ctrl` is honoured for Windows/Linux, where it is THE new-tab modifier. On
 * macOS it is inert by construction: Ctrl-click is the secondary click there,
 * so the OS raises a context menu and no `click` event is ever delivered.
 *
 * Shift is deliberately untouched. In a browser it means "new window", and
 * whether this app draws windows at all is the surface mode — a per-surface
 * user setting that a single link has no business overriding.
 */
export interface LinkGestureProps {
  onClick(e: MouseEvent): void;
  onAuxClick(e: MouseEvent): void;
  onMouseDown(e: MouseEvent): void;
}

/** Build the {@link LinkGestureProps} for an `open` action (see the interface). */
export function linkGestureProps(
  open: (opts: { newTab: boolean }) => void,
): LinkGestureProps {
  return {
    onClick(e) {
      open({ newTab: e.metaKey || e.ctrlKey });
    },
    onAuxClick(e) {
      if (e.button !== 1) return;
      // The default middle-button action (autoscroll on Windows, paste on
      // X11) has nothing to do with navigating, so it never reaches the page.
      e.preventDefault();
      open({ newTab: true });
    },
    onMouseDown(e) {
      // Autoscroll arms on mousedown, not on the aux click — cancelling it
      // there is too late to stop the scroll cursor appearing.
      if (e.button === 1) e.preventDefault();
    },
  };
}
