import { useResource } from "@plugins/primitives/plugins/live-state/web";
import type { AuthAccountState } from "@plugins/auth/shared";
import { authStateResource } from "@plugins/auth/shared";

export function useAuthState() {
  return useResource(authStateResource);
}

export function useAccountStatus(providerId: string): AuthAccountState | null {
  const { data } = useAuthState();
  return data.providers[providerId] ?? null;
}
