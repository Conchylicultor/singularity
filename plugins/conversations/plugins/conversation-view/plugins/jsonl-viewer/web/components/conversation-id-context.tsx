import { createContext, useContext, type ReactNode } from "react";

const ConversationIdContext = createContext<string | null>(null);

export function ConversationIdProvider({
  id,
  children,
}: {
  id: string;
  children: ReactNode;
}) {
  return (
    <ConversationIdContext.Provider value={id}>
      {children}
    </ConversationIdContext.Provider>
  );
}

export function useJsonlConversationId(): string | null {
  return useContext(ConversationIdContext);
}
