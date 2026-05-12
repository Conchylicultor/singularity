import { defineSlot } from "@core";
import type { AppShellSidebarItem } from "@plugins/primitives/plugins/app-shell/web";
import { defineRenderSlot } from "@plugins/primitives/plugins/slot-render/web";
import { Reorder } from "@plugins/reorder/web";

export const Forge = {
  Sidebar: defineRenderSlot<AppShellSidebarItem>("forge.sidebar", {
    docLabel: (p) => p.title,
    reorder: { getLabel: (item) => item.title },
  }),

  Toolbar: Reorder.area(
    defineSlot<{
      label?: string;
      icon?: ComponentType<{ className?: string }>;
      onClick?: () => void;
      component?: ComponentType;
      group?: string;
    }>("forge.toolbar", { docLabel: (p) => p.label }),
    {
      getGroup: (item) => item.group ?? null,
      getLabel: (item) => item.label ?? item.id,
    },
  ),
};
