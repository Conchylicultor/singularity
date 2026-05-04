import { createContext, useContext } from "react";

export type FileOpenHandler = (filePath: string, line?: number) => void;

const FileOpenContext = createContext<FileOpenHandler | undefined>(undefined);

export const FileOpenProvider = FileOpenContext.Provider;

export function useFileOpen(): FileOpenHandler | undefined {
  return useContext(FileOpenContext);
}
