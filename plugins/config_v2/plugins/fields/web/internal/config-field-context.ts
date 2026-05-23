import { createContext } from "react";

export const ConfigFieldContext = createContext<{ storePath: string; fieldKey: string } | null>(null);
