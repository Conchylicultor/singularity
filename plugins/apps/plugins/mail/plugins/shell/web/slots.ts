import type { ComponentType } from "react";
import type { AppShellSidebarItem } from "@plugins/primitives/plugins/app-shell/web";
import { defineRenderSlot } from "@plugins/primitives/plugins/slot-render/web";

export const Mail = {
  /** Left-rail entries — one per mail surface (mailboxes, labels, …). */
  Sidebar: defineRenderSlot<AppShellSidebarItem>({
    docLabel: (p) => p.title,
  }),
  /**
   * Full-width status strip rendered above the mail surface on every route.
   * Sub-plugins contribute a bare component (the sync-status banner today); each
   * is free to render `null` when it has nothing to show, so the strip collapses
   * to zero height when the mailbox is healthy.
   */
  Banner: defineRenderSlot<{ component: ComponentType }>(),
  /**
   * Attention overlays for the Mail app's rail icon. Each contributor renders a
   * dot when the mailbox needs attention (e.g. an unhealthy sync), or `null`
   * otherwise. Keeps the rail icon's attention state aggregated from the
   * surfaces themselves rather than the shell naming any one of them.
   */
  RailBadge: defineRenderSlot<{ component: ComponentType }>(),
};
