import type {
  AuthAccountState,
  AuthStateValue,
} from "@plugins/auth/shared";
import { listProviders } from "./registry";
import { getAccount } from "./token-store";
import { tryResolveCredentials } from "./credentials";

const credentialsConfiguredCache = new Map<string, boolean>();

async function refreshCredentialsConfiguredCache(): Promise<void> {
  for (const provider of listProviders()) {
    if (provider.kind === "oauth2") {
      const creds = await tryResolveCredentials(provider);
      credentialsConfiguredCache.set(provider.id, creds !== null);
    } else {
      // API-key providers don't need pre-configured credentials.
      credentialsConfiguredCache.set(provider.id, true);
    }
  }
}

let warmed = false;
let warmingPromise: Promise<void> | null = null;

export function warmAuthState(): Promise<void> {
  if (warmed) return Promise.resolve();
  if (warmingPromise) return warmingPromise;
  warmingPromise = refreshCredentialsConfiguredCache().then(() => {
    warmed = true;
    warmingPromise = null;
  });
  return warmingPromise;
}

export function invalidateAuthStateCache(): void {
  warmed = false;
  warmingPromise = null;
}

/**
 * Compute the public AuthStateValue from the token store + provider registry.
 * NEVER includes secret material. Safe to broadcast over WS.
 */
export function computeAuthState(): AuthStateValue {
  const out: AuthStateValue = { providers: {} };
  for (const provider of listProviders()) {
    const account = getAccount(provider.id, "primary");
    const credentialsConfigured =
      credentialsConfiguredCache.get(provider.id) ?? true;
    if (!account) {
      const state: AuthAccountState = {
        connected: false,
        kind: provider.kind,
        credentialsConfigured,
      };
      out.providers[provider.id] = state;
      continue;
    }
    const state: AuthAccountState = {
      connected: !account.needsReconsent,
      kind: account.kind,
      credentialsConfigured,
      identity: account.identity,
      scopes: account.scopes,
      needsReconsent: account.needsReconsent,
      connectedAt: account.connectedAt,
      lastRefreshError: account.lastRefreshError,
    };
    out.providers[provider.id] = state;
  }
  return out;
}
