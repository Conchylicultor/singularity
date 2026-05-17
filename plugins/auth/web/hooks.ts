import { useResource, type ResourceResult } from "@plugins/primitives/plugins/live-state/web";
import type { AuthAccountState, AuthStateValue } from "@plugins/auth/core";
import { authStateResource } from "@plugins/auth/core";

export function useAuthState(): ResourceResult<AuthStateValue> {
  return useResource(authStateResource);
}

export function useAccountStatus(providerId: string): AuthAccountState | null {
  const result = useAuthState();
  if (result.pending) return null;
  return result.data.providers[providerId] ?? null;
}
