import { createContext, useContext, useState, type ReactNode } from "react";

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
  return (
    <StatsContext.Provider value={{ showEmptyDays, setShowEmptyDays }}>
      {children}
    </StatsContext.Provider>
  );
}

export function useShowEmptyDays() {
  return useContext(StatsContext);
}
