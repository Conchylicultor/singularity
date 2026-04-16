import { createContext, useContext, type ComponentType } from "react";
import { defineCommand } from "@core";
import type { ConversationState } from "./slots";

export interface MiddlePaneDescriptor {
  id: string;
  component: ComponentType<{ conversation: ConversationState }>;
}

export type RightPaneDescriptor = MiddlePaneDescriptor;
export type MainViewDescriptor = MiddlePaneDescriptor;

export const Conversation = {
  OpenMiddlePane: defineCommand<MiddlePaneDescriptor | null, void>(
    "conversation.open-middle-pane",
  ),
  OpenRightPane: defineCommand<RightPaneDescriptor | null, void>(
    "conversation.open-right-pane",
  ),
  OpenMainView: defineCommand<MainViewDescriptor | null, void>(
    "conversation.open-main-view",
  ),
};

export const MiddlePaneContext = createContext<MiddlePaneDescriptor | null>(
  null,
);
export const RightPaneContext = createContext<RightPaneDescriptor | null>(null);
export const MainViewContext = createContext<MainViewDescriptor | null>(null);

export function useMiddlePane(): MiddlePaneDescriptor | null {
  return useContext(MiddlePaneContext);
}
export function useRightPane(): RightPaneDescriptor | null {
  return useContext(RightPaneContext);
}
export function useMainView(): MainViewDescriptor | null {
  return useContext(MainViewContext);
}
