import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

interface RowMarkdown {
  markdownMode: boolean;
  setMarkdownMode: (v: boolean) => void;
}

const RowMarkdownContext = createContext<RowMarkdown | null>(null);

export function RowMarkdownProvider({ children }: { children: ReactNode }) {
  const [markdownMode, setMarkdownMode] = useState(true);

  const ctxValue = useMemo(
    () => ({ markdownMode, setMarkdownMode }),
    [markdownMode, setMarkdownMode],
  );

  return (
    <RowMarkdownContext.Provider value={ctxValue}>
      {children}
    </RowMarkdownContext.Provider>
  );
}

export function useRowMarkdown(): RowMarkdown {
  const ctx = useContext(RowMarkdownContext);
  if (!ctx) throw new Error("useRowMarkdown must be used within RowMarkdownProvider");
  return ctx;
}
