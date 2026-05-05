import { defineSlot } from "@core";
import type { ComponentType } from "react";
import { Reorder } from "@plugins/reorder/web";

export const Apps = {
  App: Reorder.area(
    defineSlot<{
      icon: ComponentType<{ className?: string }>;
      tooltip: string;
      component: ComponentType;
      isActive: (pathname: string) => boolean;
      onClick: () => void;
    }>("apps.app"),
  ),
};
