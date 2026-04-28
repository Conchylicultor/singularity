import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type PromptImageDraft = {
  id: string;
  mime: string;
  dataUrl: string;
};

export type PromptDraft = {
  text: string;
  images: PromptImageDraft[];
};

export const EMPTY_DRAFT: PromptDraft = { text: "", images: [] };

export function isDraftEmpty(draft: PromptDraft): boolean {
  return draft.text.trim().length === 0 && draft.images.length === 0;
}

export function draftToPlainText(draft: PromptDraft): string {
  return draft.text.replace(/<<<image:\d+>>>/g, "").trim();
}

type DraftStore = {
  drafts: Map<string, PromptDraft>;
  setDraft: (convId: string, value: PromptDraft) => void;
  clearDraft: (convId: string) => void;
};

const PromptDraftContext = createContext<DraftStore | null>(null);

export function PromptDraftProvider({ children }: { children: ReactNode }) {
  const [drafts, setDrafts] = useState<Map<string, PromptDraft>>(
    () => new Map(),
  );

  const setDraft = useCallback((convId: string, value: PromptDraft) => {
    setDrafts((prev) => {
      const next = new Map(prev);
      if (isDraftEmpty(value)) next.delete(convId);
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
  const draft = store.drafts.get(convId) ?? EMPTY_DRAFT;
  const setDraft = useCallback(
    (value: PromptDraft) => store.setDraft(convId, value),
    [store, convId],
  );
  const clearDraft = useCallback(
    () => store.clearDraft(convId),
    [store, convId],
  );
  return { draft, setDraft, clearDraft };
}
