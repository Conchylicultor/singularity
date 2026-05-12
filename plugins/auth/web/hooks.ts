import { useResource } from "@plugins/primitives/plugins/live-state/web";
import type { AuthAccountState } from "@plugins/auth/core";
import { authStateResource } from "@plugins/auth/core";

export function useAuthState() {
  return useResource(authStateResource);
}

export function useAccountStatus(providerId: string): AuthAccountState | null {
  const { data } = useAuthState();
  return data.providers[providerId] ?? null;
}
