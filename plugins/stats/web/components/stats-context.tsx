import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

interface StatsContextValue {
  showEmptyDays: boolean;
  setShowEmptyDays: (v: boolean) => void;
}

const StatsContext = createContext<StatsContextValue>({
  showEmptyDays: false,
  setShowEmptyDays: () => {},
});

export function StatsProvider({ children }: { children: ReactNode }) {
  const [showEmptyDays, setShowEmptyDays] = useState(false);

  const ctxValue = useMemo(
    () => ({ showEmptyDays, setShowEmptyDays }),
    [showEmptyDays, setShowEmptyDays],
  );

  return (
    <StatsContext.Provider value={ctxValue}>
      {children}
    </StatsContext.Provider>
  );
}

export function useShowEmptyDays() {
  return useContext(StatsContext);
}
