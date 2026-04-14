import { createContext, useContext, type ComponentType } from "react";
import { defineCommand } from "@core";
import type { ConversationState } from "./slots";

export interface MiddlePaneDescriptor {
  id: string;
  component: ComponentType<{ conversation: ConversationState }>;
}

export const Conversation = {
  OpenMiddlePane: defineCommand<MiddlePaneDescriptor | null, void>(
    "conversation.open-middle-pane",
  ),
};

export const MiddlePaneContext = createContext<MiddlePaneDescriptor | null>(
  null,
);

export function useMiddlePane(): MiddlePaneDescriptor | null {
  return useContext(MiddlePaneContext);
}
