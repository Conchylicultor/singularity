import type { Contribution } from "@core";
import type { ComponentType, ReactNode } from "react";

export interface ReorderConfig<P> {
  getGroup?: (item: P) => string | null;
  getLabel?: (item: P) => string;
  enableGroups?: boolean;
}

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
