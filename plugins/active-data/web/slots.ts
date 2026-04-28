import { defineSlot } from "@core";
import type { ComponentType } from "react";

export interface ActiveDataTagContribution {
  // Lowercase XML tag name (a-z, 0-9, '-'). Match is case-sensitive.
  tag: string;
  component: ComponentType<{
    attrs: Record<string, string>;
    children: string;
  }>;
}

export const ActiveData = {
  Tag: defineSlot<ActiveDataTagContribution>("active-data.tag"),
};
