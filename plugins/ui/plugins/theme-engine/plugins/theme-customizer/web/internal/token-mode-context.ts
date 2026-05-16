import { createContext } from "react";

export type TokenMode = "both" | "light" | "dark";

export const TokenModeContext = createContext<TokenMode>("both");
