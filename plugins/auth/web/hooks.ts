import type { ResourceResult } from "@plugins/primitives/plugins/live-state/web";
import { useLive } from "@plugins/network/plugins/live/web";
import type { AuthAccountState, AuthStateValue } from "@plugins/auth/core";
import { authState } from "@plugins/auth/core";

export function useAuthState(): ResourceResult<AuthStateValue> {
  return useLive(authState);
}

export function useAccountStatus(providerId: string): AuthAccountState | null {
  const result = useAuthState();
  if (result.pending) return null;
  return result.data.providers[providerId] ?? null;
}
