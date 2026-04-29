import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { ATTACHMENT_MARKDOWN_RE } from "@plugins/primitives/plugins/paste-images/web";

const STORAGE_KEY = "singularity:prompt-drafts-v2";

// Drafts are markdown strings. Pasted images are stored inline as
// `![](/api/attachments/<id>)` refs — uploaded immediately, so a refresh
// re-hydrates the same image via /api/attachments/:id (the attachment row
// survives until the orphan sweep TTL or until the conversation links it).
export type PromptDraft = {
  markdown: string;
};

export const EMPTY_DRAFT: PromptDraft = { markdown: "" };

export function isDraftEmpty(draft: PromptDraft): boolean {
  return draft.markdown.trim().length === 0;
}

// Strip attachment image refs from the markdown — useful when seeding a
// title or a preview that shouldn't include the inline image markdown.
export function draftToPlainText(draft: PromptDraft): string {
  return draft.markdown
    .replace(new RegExp(ATTACHMENT_MARKDOWN_RE.source, "g"), "")
    .trim();
}

function readDraftsFromStorage(): Map<string, PromptDraft> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Map();
    const parsed = JSON.parse(raw) as Record<string, string>;
    return new Map(
      Object.entries(parsed).map(([k, markdown]) => [k, { markdown }]),
    );
  } catch {
    return new Map();
  }
}

function writeDraftsToStorage(drafts: Map<string, PromptDraft>) {
  try {
    const obj: Record<string, string> = {};
    for (const [k, v] of drafts) {
      if (v.markdown.trim()) obj[k] = v.markdown;
    }
    if (Object.keys(obj).length === 0) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
  } catch {
    // Quota exceeded — silently ignore
  }
}

type DraftStore = {
  drafts: Map<string, PromptDraft>;
  setDraft: (convId: string, value: PromptDraft) => void;
  clearDraft: (convId: string) => void;
};

const PromptDraftContext = createContext<DraftStore | null>(null);

export function PromptDraftProvider({ children }: { children: ReactNode }) {
  const [drafts, setDrafts] = useState<Map<string, PromptDraft>>(readDraftsFromStorage);

  const setDraft = useCallback((convId: string, value: PromptDraft) => {
    setDrafts((prev) => {
      const next = new Map(prev);
      if (isDraftEmpty(value)) next.delete(convId);
      else next.set(convId, value);
      writeDraftsToStorage(next);
      return next;
    });
  }, []);

  const clearDraft = useCallback((convId: string) => {
    setDrafts((prev) => {
      if (!prev.has(convId)) return prev;
      const next = new Map(prev);
      next.delete(convId);
      writeDraftsToStorage(next);
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
