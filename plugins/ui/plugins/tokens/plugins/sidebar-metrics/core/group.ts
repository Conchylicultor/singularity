import { defineTokenGroup } from "@plugins/ui/plugins/theme-engine/core";

/**
 * The sizes of the app-shell sidebar's chrome: how wide the panel is, and the
 * geometry of a nav row (its height, inline padding, icon and icon-to-label
 * gap). NOT its type: a nav row's label is the `label` role (`text-label`,
 * type-scale), so it follows the theme's role ladder and `--font-scale` like
 * every other label — this group declares no font size, line height or weight
 * (the `type-scale:closed-role-ladder` check fails on one).
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
  // The inset under the sidebar's last item (`h-sidebar-end`). Default 0:
  // the last item sits on the sidebar's bottom edge, as it always did.
  sidebarEndPad: { default: "0px", label: "Sidebar bottom inset" },
  // The sidebar's rail: the inset its bands (section heads, the brand-free
  // content) pay and its row pills sit in by (`rail-owe-sidebar`). Default =
  // the `sm` step it always was.
  sidebarRail: { default: "var(--space-sm)", label: "Sidebar rail" },
  // The brand heading the sidebar (`AppShell.Brand`'s header form): the
  // launcher mark's size, the gap after the launcher, and the app name
  // button's inline padding. Defaults = the 24px mark, `2xs` gap and `md`
  // control padding it always had; a theme that wants the name tight to a
  // smaller mark (a 16px glyph, 8px to its name) sets them.
  sidebarBrandMarkSize: { default: "1.5rem", label: "Sidebar brand mark size" },
  sidebarBrandGap: { default: "var(--space-2xs)", label: "Sidebar brand gap" },
  sidebarBrandNamePadX: {
    default: "var(--control-pad-md)",
    label: "Sidebar brand name padding X",
  },
});

export type SidebarMetricsTokenValues = {
  [K in keyof typeof sidebarMetricsGroup.schema]: string;
};
