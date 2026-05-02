import { defineSlot } from "@core";
import type { ComponentType } from "react";
import { Reorder } from "@plugins/reorder/web";

export const Conversation = {
  ActionBar: Reorder.area(
    defineSlot<{ component: ComponentType }>("conversation.action-bar"),
  ),
};
