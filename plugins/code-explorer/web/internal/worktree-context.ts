import { createContext, useContext } from "react";

export const WorktreeContext = createContext<string | null>(null);

export function useWorktreeContext() {
  return useContext(WorktreeContext);
}
