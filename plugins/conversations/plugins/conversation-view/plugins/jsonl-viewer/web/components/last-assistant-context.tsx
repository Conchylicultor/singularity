import { createContext, useContext, type ReactNode } from "react";
import type { JsonlEvent } from "@plugins/conversations/plugins/transcript-watcher/shared";

const LastAssistantContext = createContext<JsonlEvent | null>(null);

export function LastAssistantProvider({
  event,
  children,
}: {
  event: JsonlEvent | null;
  children: ReactNode;
}) {
  return (
    <LastAssistantContext.Provider value={event}>
      {children}
    </LastAssistantContext.Provider>
  );
}

export function useLastAssistantEvent(): JsonlEvent | null {
  return useContext(LastAssistantContext);
}
