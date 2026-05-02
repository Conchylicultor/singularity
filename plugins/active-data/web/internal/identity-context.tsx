import { createContext, useContext, type ReactNode } from "react";

// Identity for a block-tag widget instance, threaded by the host renderer
// (e.g. the JSONL assistant-text row). Carries `conversationId` so the
// binding hook avoids importing `conversationPane` (would create a cycle:
// active-data → conversation-view → active-data). Absent when the host has
// no stable messageId (legacy logs); consumers degrade to non-persistent.
export interface ActiveDataIdentity {
  conversationId: string;
  messageId: string;
  tag: string;
  occurrenceIndex: number;
}

const Ctx = createContext<ActiveDataIdentity | null>(null);

export function ActiveDataIdentityProvider({
  conversationId,
  messageId,
  tag,
  occurrenceIndex,
  children,
}: ActiveDataIdentity & { children: ReactNode }) {
  return (
    <Ctx.Provider
      value={{ conversationId, messageId, tag, occurrenceIndex }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useActiveDataIdentity(): ActiveDataIdentity | null {
  return useContext(Ctx);
}
