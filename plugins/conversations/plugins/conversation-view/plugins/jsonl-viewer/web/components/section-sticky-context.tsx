import { createContext, useContext } from "react";

const StickyReportContext = createContext<(expanded: boolean) => void>(() => {});

export const StickyReportProvider = StickyReportContext.Provider;
export const useStickyReport = () => useContext(StickyReportContext);
