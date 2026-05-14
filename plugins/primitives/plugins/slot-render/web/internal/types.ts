import type { Contribution } from "@plugins/framework/plugins/web-sdk/core";
import type { ComponentType, ReactNode } from "react";

export interface SlotItemMiddleware {
  priority: number;
  Component: ComponentType<{
    slotId: string;
    contribution: Contribution;
    children: ReactNode;
  }>;
}

export interface SlotListMiddleware {
  priority: number;
  Component: ComponentType<{
    slotId: string;
    contributions: Contribution[];
    renderItem: (contribution: Contribution) => ReactNode;
    children: ReactNode;
  }>;
}
