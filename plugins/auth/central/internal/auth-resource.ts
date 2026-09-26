import { serveValue } from "@plugins/network/plugins/live/central";
import { authState } from "@plugins/auth/core";
import { computeAuthState, warmAuthState } from "./auth-state";

export const authStateServed = serveValue(authState, {
  source: "external",
  loader: async () => {
    await warmAuthState();
    return computeAuthState();
  },
});

export function notifyAuthState(): void {
  authStateServed.notify();
}
