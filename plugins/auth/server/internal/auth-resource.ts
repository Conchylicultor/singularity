import { defineResource } from "@server/resources";
import type { AuthStateValue } from "@plugins/auth/shared";
import { isMain } from "./paths";
import { computeAuthState, warmAuthState } from "./auth-state";
import { rpcStatus } from "./unix-rpc/client";

export const authStateResource = defineResource<AuthStateValue>({
  key: "auth-state",
  mode: "push",
  loader: async () => {
    if (isMain()) {
      await warmAuthState();
      return computeAuthState();
    }
    try {
      return await rpcStatus();
    } catch {
      return { mainOffline: true, providers: {} };
    }
  },
});

export function notifyAuthState(): void {
  authStateResource.notify();
}
