import { defineResource } from "@central/resources";
import type { AuthStateValue } from "@plugins/auth/shared";
import { computeAuthState, warmAuthState } from "./auth-state";

export const authStateResource = defineResource<AuthStateValue>({
  key: "auth-state",
  mode: "push",
  loader: async () => {
    await warmAuthState();
    return computeAuthState();
  },
});

export function notifyAuthState(): void {
  authStateResource.notify();
}
