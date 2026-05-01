import { defineSlot } from "@core";
import type { ComponentType } from "react";

export const Conversation = {
  ActionBar: defineSlot<{ component: ComponentType }>("conversation.action-bar"),
};
