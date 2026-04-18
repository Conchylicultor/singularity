import { createContext, useContext } from "react";

export interface ConversationPaneController {
  activeId: string | null;
  open: (id: string) => void;
  close: () => void;
}

export const ConversationPaneContext =
  createContext<ConversationPaneController | null>(null);

export function useConversationPane(): ConversationPaneController | null {
  return useContext(ConversationPaneContext);
}
