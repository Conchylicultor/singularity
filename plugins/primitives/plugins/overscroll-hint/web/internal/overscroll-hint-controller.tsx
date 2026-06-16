import { useEffect } from "react";
import { installOverscrollHint } from "./overscroll-detector";
import "./overscroll-hint.css";

/**
 * Invisible global controller. Mounted once via `Core.Root`, it installs the
 * wasted-scroll detector on the window for the lifetime of the app and renders
 * nothing.
 */
export function OverscrollHintController(): null {
  useEffect(() => installOverscrollHint(), []);
  return null;
}
