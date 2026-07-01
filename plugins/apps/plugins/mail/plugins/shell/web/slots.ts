import type { ComponentType } from "react";
import type { AppShellSidebarItem } from "@plugins/primitives/plugins/app-shell/web";
import { defineRenderSlot } from "@plugins/primitives/plugins/slot-render/web";
import { mailApp } from "../core";

/** The Mail app's base URL path and its index pane's `appPath`. */
export const MAIL_APP_PATH = mailApp.basePath;

export const Mail = {
  /** Left-rail entries — one per mail surface (mailboxes, labels, …). */
  Sidebar: defineRenderSlot<AppShellSidebarItem>("mail.sidebar", {
    docLabel: (p) => p.title,
  }),
  /**
   * Full-width status strip rendered above the mail surface on every route.
   * Sub-plugins contribute a bare component (the sync-status banner today); each
   * is free to render `null` when it has nothing to show, so the strip collapses
   * to zero height when the mailbox is healthy.
   */
  Banner: defineRenderSlot<{ component: ComponentType }>("mail.banner"),
  /**
   * Attention overlays for the Mail app's rail icon. Each contributor renders a
   * dot when the mailbox needs attention (e.g. an unhealthy sync), or `null`
   * otherwise. Keeps the rail icon's attention state aggregated from the
   * surfaces themselves rather than the shell naming any one of them.
   */
  RailBadge: defineRenderSlot<{ component: ComponentType }>("mail.rail-badge"),
};
