import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

/**
 * The conversation's prompt, as reachable from anywhere else in its pane — the
 * transcript above it included. The prompt input registers it; a reader gets
 * `null` while no prompt is mounted (a sub-agent's pane, a conversation with no
 * bottom bar), so "there is no prompt to talk to" is a state to render, not a
 * call that silently goes nowhere.
 */
export interface PromptComposer {
  /** Insert markdown at the prompt's caret (its end when it has none) and focus it. */
  insert: (text: string) => void;
  /** Send `text` as a turn of its own, leaving the draft untouched. */
  send: (text: string) => void;
  /** Whether the conversation accepts a turn right now — the prompt's own gate. */
  canSend: boolean;
}

type PromptComposerCtx = {
  composer: PromptComposer | null;
  setComposer: (c: PromptComposer | null) => void;
};

const Ctx = createContext<PromptComposerCtx | null>(null);

export function PromptComposerProvider({ children }: { children: ReactNode }) {
  const [composer, setComposer] = useState<PromptComposer | null>(null);
  const value = useMemo(() => ({ composer, setComposer }), [composer]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** The pane's prompt, or `null` when none is mounted (or there is no provider). */
export function usePromptComposer(): PromptComposer | null {
  return useContext(Ctx)?.composer ?? null;
}

/**
 * Publish THE prompt of this pane. Pass stable `insert` / `send` callbacks: the
 * registration is replaced whenever one of the three fields changes.
 */
export function useRegisterPromptComposer({
  insert,
  send,
  canSend,
}: PromptComposer): void {
  const setComposer = useContext(Ctx)?.setComposer;
  useEffect(() => {
    if (!setComposer) return;
    setComposer({ insert, send, canSend });
    return () => setComposer(null);
  }, [setComposer, insert, send, canSend]);
}
