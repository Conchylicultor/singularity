import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type DraftStore = {
  drafts: Map<string, string>;
  setDraft: (convId: string, value: string) => void;
  clearDraft: (convId: string) => void;
};

const PromptDraftContext = createContext<DraftStore | null>(null);

export function PromptDraftProvider({ children }: { children: ReactNode }) {
  const [drafts, setDrafts] = useState<Map<string, string>>(() => new Map());

  const setDraft = useCallback((convId: string, value: string) => {
    setDrafts((prev) => {
      const next = new Map(prev);
      if (value.length === 0) next.delete(convId);
      else next.set(convId, value);
      return next;
    });
  }, []);

  const clearDraft = useCallback((convId: string) => {
    setDrafts((prev) => {
      if (!prev.has(convId)) return prev;
      const next = new Map(prev);
      next.delete(convId);
      return next;
    });
  }, []);

  const value = useMemo<DraftStore>(
    () => ({ drafts, setDraft, clearDraft }),
    [drafts, setDraft, clearDraft],
  );

  return (
    <PromptDraftContext.Provider value={value}>
      {children}
    </PromptDraftContext.Provider>
  );
}

export function usePromptDraft(convId: string) {
  const store = useContext(PromptDraftContext);
  if (!store) {
    throw new Error("usePromptDraft must be used within PromptDraftProvider");
  }
  const draft = store.drafts.get(convId) ?? "";
  const setDraft = useCallback(
    (value: string) => store.setDraft(convId, value),
    [store, convId],
  );
  const clearDraft = useCallback(
    () => store.clearDraft(convId),
    [store, convId],
  );
  return { draft, setDraft, clearDraft };
}
