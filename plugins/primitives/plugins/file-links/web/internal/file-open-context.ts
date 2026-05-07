import { createContext, useContext } from "react";

export const FileOpenContext = createContext<
  ((path: string, line?: number) => void) | null
>(null);

export function useFileOpen() {
  return useContext(FileOpenContext);
}
