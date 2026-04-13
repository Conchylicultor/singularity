import { defineSlot } from "@core";
import type { ComponentType } from "react";

export const Stats = {
  Chart: defineSlot<{
    id: string;
    title: string;
    component: ComponentType;
  }>("stats.chart"),
};
