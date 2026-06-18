import type { AppShellSidebarItem } from "@plugins/primitives/plugins/app-shell/web";
import { defineRenderSlot } from "@plugins/primitives/plugins/slot-render/web";

export const Pages = {
  Sidebar: defineRenderSlot<AppShellSidebarItem>("pages.sidebar", {
    docLabel: (p) => p.title,
  }),
};
