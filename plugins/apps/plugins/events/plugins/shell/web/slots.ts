import type { AppShellSidebarItem } from "@plugins/primitives/plugins/app-shell/web";
import { defineRenderSlot } from "@plugins/primitives/plugins/slot-render/web";

export const Events = {
  /**
   * Left-rail entries — one per Events surface (the events list, Sources, …).
   * Contributed by the feature sub-plugins; the shell names none of them, so a
   * new surface drops in with zero edits here.
   */
  Sidebar: defineRenderSlot<AppShellSidebarItem>("events.sidebar", {
    docLabel: (p) => p.title,
  }),
};
