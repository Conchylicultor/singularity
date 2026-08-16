import type { MouseEvent } from "react";
import { navigate } from "./use-tabs";

/**
 * The handler props that turn any control into an in-app link obeying the
 * browser's own conventions:
 *
 *   • plain click            → go there in THIS tab
 *   • ⌘/Ctrl-click, middle-click → open it in a NEW tab, staying where you are
 *
 * These are the gestures every user already has in their fingers, so a control
 * that navigates should honour them without each call site re-deriving
 * "button === 1" and "metaKey || ctrlKey". This is the one definition; spread it
 * onto the control:
 *
 * ```tsx
 * <IconButton icon={MdOpenInFull} label="Open in Pages" {...appLinkProps(url)} />
 * ```
 *
 * Deliberately NOT an `<a href>`. These URLs address *in-app* tabs, which the
 * browser knows nothing about — a real anchor's middle-click would spawn a
 * browser tab that cold-boots the whole SPA and lands beside the app rather than
 * inside it. So the control stays a button and the gestures are read here.
 *
 * Shift-click is intentionally left alone: in a browser it means "new window",
 * and this surface's window-ness is the surface mode (docked / windows / solo),
 * which is a per-surface user setting rather than something one link may
 * override.
 */
export interface AppLinkProps {
  onClick(e: MouseEvent): void;
  onAuxClick(e: MouseEvent): void;
  onMouseDown(e: MouseEvent): void;
}

/** Build the {@link AppLinkProps} for an app-rooted `url` (see the interface). */
export function appLinkProps(url: string): AppLinkProps {
  return {
    onClick(e) {
      navigate(url, { newTab: e.metaKey || e.ctrlKey });
    },
    onAuxClick(e) {
      if (e.button !== 1) return;
      // The default middle-button action (paste-on-X11, autoscroll on Windows)
      // has nothing to do with navigating, so it never reaches the page.
      e.preventDefault();
      navigate(url, { newTab: true });
    },
    onMouseDown(e) {
      // Autoscroll arms on mousedown, not on the aux click — cancelling it there
      // is too late to stop the scroll cursor appearing.
      if (e.button === 1) e.preventDefault();
    },
  };
}
