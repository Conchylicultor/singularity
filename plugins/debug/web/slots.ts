import { defineSlot } from "@core";
import type { ComponentType } from "react";

export const Debug = {
  Item: defineSlot<{
    id: string;
    title: string;
    icon: ComponentType<{ className?: string }>;
    onClick: () => void;
  }>("debug.item"),
};
