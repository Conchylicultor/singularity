import type { ComponentType } from "react";
import {
  defineRenderSlot,
  defineMountSlot,
} from "@plugins/primitives/plugins/slot-render/web";

/**
 * Slots the browser shell defines for its sub-plugins. Every visible item shape
 * is `{ id; component }`; render with `{(item) => <item.component />}`. Order is
 * registration order (reorder primitive handles user reordering automatically).
 */
export const Browser = {
  /** Leading navigation buttons (back/forward/reload/home) in the chrome bar. */
  NavControls: defineRenderSlot<{ component: ComponentType }>(
    "browser.nav-controls",
    { docLabel: () => "Navigation controls" },
  ),
  /** The address bar; rendered center (flex-1) in the chrome bar. */
  Omnibox: defineRenderSlot<{ component: ComponentType }>("browser.omnibox", {
    docLabel: () => "Omnibox",
  }),
  /** Trailing chrome-bar actions (open-external, bookmark star). */
  Actions: defineRenderSlot<{ component: ComponentType }>("browser.actions", {
    docLabel: () => "Chrome actions",
  }),
  /** Second row below the chrome bar (e.g. bookmarks bar). Empty → nothing. */
  SubBar: defineRenderSlot<{ component: ComponentType }>("browser.sub-bar", {
    docLabel: () => "Sub bar",
  }),
  /** The main content area — the webview iframe viewport. */
  Viewport: defineRenderSlot<{ component: ComponentType }>("browser.viewport", {
    docLabel: () => "Viewport",
  }),
  /** Start page, rendered by the webview when `current === ""`. */
  StartPage: defineRenderSlot<{ component: ComponentType }>(
    "browser.start-page",
    { docLabel: () => "Start page" },
  ),
  /** Headless effects (e.g. history recorder); mounts for side effects only. */
  Effects: defineMountSlot("browser.effects", {
    docLabel: () => "Effects",
  }),
};
