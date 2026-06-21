import { createContext, useCallback, useContext, useMemo, useRef, type ReactNode } from "react";

type InsertFn = (text: string) => void;

type PromptInsertCtx = {
  registerInsert: (fn: InsertFn) => () => void;
  insertAtCursor: InsertFn;
};

const Ctx = createContext<PromptInsertCtx | null>(null);

export function PromptInsertProvider({ children }: { children: ReactNode }) {
  const insertRef = useRef<InsertFn | null>(null);

  const registerInsert = useCallback((fn: InsertFn) => {
    insertRef.current = fn;
    return () => {
      insertRef.current = null;
    };
  }, []);

  const insertAtCursor = useCallback((text: string) => {
    insertRef.current?.(text);
  }, []);

  const ctxValue = useMemo(
    () => ({ registerInsert, insertAtCursor }),
    [registerInsert, insertAtCursor],
  );

  return <Ctx.Provider value={ctxValue}>{children}</Ctx.Provider>;
}

export function usePromptInsert() {
  return useContext(Ctx);
}
