import { useEffect } from "react";
import { installRenderLoopDetector } from "./render-loop-detector";

/**
 * Invisible global controller. Mounted once via `Core.Root`, it installs the
 * render-loop / DOM-rebuild-thrash detector for the lifetime of the app and
 * renders nothing.
 */
export function RenderLoopController(): null {
  useEffect(() => installRenderLoopDetector(), []);
  return null;
}
