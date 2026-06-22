import type { ComponentType } from "react";
import type { AppShellSidebarItem } from "@plugins/primitives/plugins/app-shell/web";
import { defineRenderSlot } from "@plugins/primitives/plugins/slot-render/web";
import { settingsApp } from "../core";

/** The Settings app's base URL path and its index pane's `appPath`. */
export const SETTINGS_APP_PATH = settingsApp.basePath;

export const Settings = {
  /** Left-rail entries — one per settings surface (account, config, …). */
  Sidebar: defineRenderSlot<AppShellSidebarItem>("settings.sidebar", {
    docLabel: (p) => p.title,
  }),

  /**
   * Attention overlays for the Settings app's rail icon. Each contributor
   * renders a dot when its surface needs attention (e.g. a config conflict),
   * or `null` otherwise. Keeps the rail icon's attention state aggregated from
   * the surfaces themselves rather than the shell naming any one of them.
   */
  RailBadge: defineRenderSlot<{ component: ComponentType }>(
    "settings.rail-badge",
  ),
};
