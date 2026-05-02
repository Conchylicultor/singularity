import { existsSync } from "node:fs";
import { join } from "node:path";
import type { GuardContext, Verdict } from "./types";

export function createContext(cwd: string): GuardContext {
  return {
    cwd,
    hasBypass(token: string): boolean {
      return existsSync(join(cwd, token));
    },
    allow(): Verdict {
      return { kind: "allow" };
    },
    deny(reason: string): Verdict {
      return { kind: "deny", reason };
    },
  };
}
