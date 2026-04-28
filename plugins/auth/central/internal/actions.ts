import type { AuthIdentity } from "@plugins/auth/shared";
import { getProvider } from "./registry";
import { deleteAccount, setAccount } from "./token-store";
import { invalidateAuthStateCache } from "./auth-state";
import { notifyAuthState } from "./auth-resource";

export async function disconnectAccount(
  providerId: string,
  accountId = "primary",
): Promise<void> {
  await deleteAccount(providerId, accountId);
  // TODO: invoke descriptor.oauth.revoke if defined (deferred per plan).
  invalidateAuthStateCache();
  notifyAuthState();
}

export async function setApiKey(
  providerId: string,
  apiKey: string,
): Promise<AuthIdentity> {
  const descriptor = getProvider(providerId);
  if (descriptor.kind !== "apikey" || !descriptor.apiKey) {
    throw new Error(
      `auth: setApiKey called on non-apikey provider "${providerId}"`,
    );
  }
  if (descriptor.apiKey.pattern && !descriptor.apiKey.pattern.test(apiKey)) {
    throw new Error(`auth: api key for "${providerId}" failed pattern check`);
  }
  const identity: AuthIdentity = descriptor.apiKey.verify
    ? await descriptor.apiKey.verify(apiKey)
    : { accountId: "primary" };
  await setAccount(providerId, "primary", {
    kind: "apikey",
    apiKey,
    identity,
    connectedAt: Date.now(),
  });
  invalidateAuthStateCache();
  notifyAuthState();
  return identity;
}

export async function emitAuthChanged(): Promise<void> {
  invalidateAuthStateCache();
  notifyAuthState();
}
