import { createContext, useContext, type ReactNode } from "react";

/**
 * Whose transcript a `TranscriptView` is drawing.
 *
 * The conversation id alone cannot say: a sub-agent's pane draws the
 * sub-agent's transcript under the PARENT conversation's id (its rows were
 * produced under it). An overlay reading the conversation's own data — its
 * sub-agents, say — needs to know which agent the view is about, or a
 * sub-agent's pane reports its parent's numbers.
 */
export type TranscriptSubject =
  | { kind: "conversation" }
  /** A sub-agent of the conversation, by its own agent id. */
  | { kind: "subagent"; agentId: string };

const TranscriptSubjectContext = createContext<TranscriptSubject | null>(null);

export function TranscriptSubjectProvider({
  subject,
  children,
}: {
  subject: TranscriptSubject;
  children: ReactNode;
}) {
  return (
    <TranscriptSubjectContext.Provider value={subject}>
      {children}
    </TranscriptSubjectContext.Provider>
  );
}

/** Whose transcript the enclosing `TranscriptView` is drawing. */
export function useTranscriptSubject(): TranscriptSubject {
  const value = useContext(TranscriptSubjectContext);
  if (!value) {
    throw new Error(
      "useTranscriptSubject must be used inside a TranscriptView (e.g. a JsonlViewer.Overlay contribution)",
    );
  }
  return value;
}
