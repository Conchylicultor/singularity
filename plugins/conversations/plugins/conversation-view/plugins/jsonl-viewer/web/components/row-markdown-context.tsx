import { createContext, useContext, useState, type ReactNode } from "react";

interface RowMarkdown {
  markdownMode: boolean;
  setMarkdownMode: (v: boolean) => void;
}

const RowMarkdownContext = createContext<RowMarkdown | null>(null);

export function RowMarkdownProvider({ children }: { children: ReactNode }) {
  const [markdownMode, setMarkdownMode] = useState(true);
  return (
    <RowMarkdownContext.Provider value={{ markdownMode, setMarkdownMode }}>
      {children}
    </RowMarkdownContext.Provider>
  );
}

export function useRowMarkdown(): RowMarkdown {
  const ctx = useContext(RowMarkdownContext);
  if (!ctx) throw new Error("useRowMarkdown must be used within RowMarkdownProvider");
  return ctx;
}
