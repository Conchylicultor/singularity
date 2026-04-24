import { useResource } from "@core";
import type { AuthAccountState } from "@plugins/auth/shared";
import { authStateResource } from "@plugins/auth/shared";

export function useAuthState() {
  return useResource(authStateResource);
}

export function useAccountStatus(providerId: string): AuthAccountState | null {
  const { data } = useAuthState();
  if (!data) return null;
  return data.providers[providerId] ?? null;
}
