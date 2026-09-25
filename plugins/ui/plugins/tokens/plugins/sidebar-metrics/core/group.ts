import { defineTokenGroup } from "@plugins/ui/plugins/theme-engine/core";

/**
 * The sizes of the app-shell sidebar's chrome: how wide the panel is, and the
 * geometry of a nav row (its height, inline padding, icon, icon-to-label gap
 * and label weight).
 *
 * Every default is the value the sidebar had before these were tokens, so a
 * theme that says nothing about this group paints today's sidebar exactly. The
 * padding and gap defaults read the density ramp (`--space-sm`) rather than
 * copying its number, so a density preset still moves them as it always did.
 *
 * A row's LEAD column is `sidebarRowPadX` in from the row's edge and
 * `sidebarIconSize` wide, and its label starts `sidebarIconGap` after it. A
 * sidebar list that wants its own leads on the nav rows' columns (the agent
 * manager's conversation rows) sizes them with the same `size-sidebar-icon` /
 * `gap-sidebar-icon` utilities.
 */
export const sidebarMetricsGroup = defineTokenGroup("sidebar-metrics", {
  // `sidebar-panel-width`, not `sidebar-width`: the ui-kit `SidebarProvider`
  // writes `--sidebar-width` inline (it switches it for the mobile sheet), and
  // reads this token for the desktop panel.
  sidebarPanelWidth: { default: "16rem", label: "Sidebar width" },
  sidebarRowHeight: { default: "2rem", label: "Sidebar row height" },
  sidebarRowPadX: {
    default: "var(--space-sm)",
    label: "Sidebar row padding X",
  },
  sidebarIconSize: { default: "1rem", label: "Sidebar icon size" },
  sidebarIconGap: { default: "var(--space-sm)", label: "Sidebar icon gap" },
  sidebarLabelWeight: { default: "400", label: "Sidebar label weight" },
});

export type SidebarMetricsTokenValues = {
  [K in keyof typeof sidebarMetricsGroup.schema]: string;
};
