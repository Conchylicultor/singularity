import {
  linkGestureProps,
  type LinkGestureProps,
} from "@plugins/primitives/plugins/link-gesture/web";
import { navigate } from "./use-tabs";

/**
 * Turn any control into an in-app link to `url`: plain click navigates here,
 * ⌘/Ctrl- and middle-click open a new tab. Spread it onto the control.
 *
 * ```tsx
 * <IconButton icon={MdOpenInNew} label="Open the run" {...appLinkProps(url)} />
 * ```
 *
 * Deliberately NOT an `<a href>`. These URLs address *in-app* tabs, which the
 * browser knows nothing about — a real anchor's middle-click would spawn a
 * browser tab that cold-boots the whole SPA and lands beside the workspace
 * rather than inside it. So the control stays a button, and the gestures come
 * from `link-gesture`, which is also what the pane primitive's Expand reads.
 */
export function appLinkProps(url: string): LinkGestureProps {
  return linkGestureProps(({ newTab }) => navigate(url, { newTab }));
}
