import { defineExternalResource } from "@plugins/framework/plugins/central-core/core";
import { AuthStateValueSchema, type AuthStateValue } from "@plugins/auth/core";
import { computeAuthState, warmAuthState } from "./auth-state";

export const authStateResource = defineExternalResource<AuthStateValue>({
  key: "auth-state",
  mode: "push",
  schema: AuthStateValueSchema,
  loader: async () => {
    await warmAuthState();
    return computeAuthState();
  },
});

export function notifyAuthState(): void {
  authStateResource.notify();
}
