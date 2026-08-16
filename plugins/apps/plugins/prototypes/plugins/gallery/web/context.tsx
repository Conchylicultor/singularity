import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

/** Which stage the detail pane paints: one prototype, or all of them side by side. */
export type PrototypeViewMode = "focus" | "compare";

export interface PrototypeDetailContextValue {
  /** The directory slug of the prototype this pane is showing. */
  name: string;
  mode: PrototypeViewMode;
  setMode: (next: PrototypeViewMode) => void;
}

const PrototypeDetailContext =
  createContext<PrototypeDetailContextValue | null>(null);

/**
 * Shared state for the detail pane's surface. Lifted out of the pane body so the
 * header controls can be zero-prop contributions to `prototypeDetailPane.Actions`
 * (the Focus/Compare switcher lives in the header, the stage it switches lives in
 * the body) — the same lift Story's `useStoryEditor()` does for its toolbar.
 */
export function usePrototypeDetail(): PrototypeDetailContextValue {
  const ctx = useContext(PrototypeDetailContext);
  if (!ctx) {
    throw new Error(
      "usePrototypeDetail must be used within a PrototypeDetailProvider",
    );
  }
  return ctx;
}

export function PrototypeDetailProvider({
  name,
  children,
}: {
  name: string;
  children: ReactNode;
}) {
  const [mode, setMode] = useState<PrototypeViewMode>("focus");
  const value = useMemo<PrototypeDetailContextValue>(
    () => ({ name, mode, setMode }),
    [name, mode],
  );
  return (
    <PrototypeDetailContext.Provider value={value}>
      {children}
    </PrototypeDetailContext.Provider>
  );
}
