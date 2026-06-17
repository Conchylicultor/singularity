import { createContext, type ReactNode } from "react";

/**
 * Surface-level chrome contributed by the app shell to the content region's
 * top-most pane header. Lets the app shell hand the pane primitive edge
 * affordances (the sidebar toggle, the floating-action-bar safe area) WITHOUT
 * the pane primitive depending on the app shell — the shell fills the context,
 * PaneChrome only reads and renders it.
 */
export interface SurfaceChrome {
  /** True when the content region's top-most pane header IS the surface's top
   *  chrome (no app-shell `chrome`-tier toolbar above it). Gates edge chrome. */
  contentOwnsTopChrome: boolean;
  /** Node mounted in the leading edge of the surface's first top-row header
   *  (e.g. the sidebar toggle). Provider owns it; PaneChrome only renders it. */
  leadingControl?: ReactNode;
}

export const SurfaceChromeContext = createContext<SurfaceChrome>({
  contentOwnsTopChrome: false,
});
