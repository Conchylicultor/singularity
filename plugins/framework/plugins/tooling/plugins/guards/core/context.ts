import { existsSync } from "node:fs";
import { join } from "node:path";
import type {
  AllowVerdict,
  DenyVerdict,
  GuardContext,
  InformVerdict,
} from "./types";

export function createContext(
  cwd: string,
  sessionId = "unknown",
): GuardContext {
  return {
    cwd,
    sessionId,
    hasBypass(token: string): boolean {
      return existsSync(join(cwd, token));
    },
    allow(): AllowVerdict {
      return { kind: "allow" };
    },
    deny(reason: string): DenyVerdict {
      return { kind: "deny", reason };
    },
    fatal(reason: string): DenyVerdict {
      return { kind: "deny", reason, fatal: true };
    },
    inform(context: string): InformVerdict {
      return { kind: "inform", context };
    },
  };
}
