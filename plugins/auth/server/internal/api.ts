import { isMain } from "./paths";
import { getProvider, listProviders } from "./registry";
import {
  getAccount,
  patchAccount,
  type StoredAccount,
} from "./token-store";
import { resolveCredentials } from "./credentials";
import { refreshAccessToken } from "./oauth-flow";
import type {
  AuthIdentity,
  AuthProviderDescriptor,
} from "@plugins/auth/shared";
import { AuthNeedsConsentError } from "@plugins/auth/shared";
import { rpcToken } from "./unix-rpc/client";
import type { TokenResponse } from "./unix-rpc/protocol";

const REFRESH_LEAD_MS = 60_000;
const inFlightRefreshes = new Map<string, Promise<StoredAccount>>();

function refreshKey(providerId: string, accountId: string): string {
  return `${providerId}::${accountId}`;
}

function scopeSubset(requested: string[], stored: string[]): boolean {
  const set = new Set(stored);
  return requested.every((s) => set.has(s));
}

async function refreshAccount(
  descriptor: AuthProviderDescriptor,
  accountId: string,
  account: StoredAccount,
): Promise<StoredAccount> {
  const key = refreshKey(descriptor.id, accountId);
  const existing = inFlightRefreshes.get(key);
  if (existing) return existing;

  const promise = (async () => {
    if (!descriptor.oauth || !account.refreshToken) {
      throw new AuthNeedsConsentError({
        providerId: descriptor.id,
        reason: "needs-reconsent",
      });
    }
    try {
      const creds = await resolveCredentials(descriptor);
      const refreshed = await refreshAccessToken({
        oauth: descriptor.oauth,
        clientId: creds.clientId,
        clientSecret: creds.clientSecret,
        refreshToken: account.refreshToken,
      });
      const updated = await patchAccount(descriptor.id, accountId, {
        accessToken: refreshed.accessToken,
        refreshToken: refreshed.refreshToken,
        expiresAt: refreshed.expiresAt,
        scopes: refreshed.scopes ?? account.scopes,
        idToken: refreshed.idToken ?? account.idToken,
        lastRefreshedAt: Date.now(),
        needsReconsent: false,
        lastRefreshError: undefined,
      });
      return updated ?? account;
    } catch (err) {
      const status = (err as { status?: number }).status;
      if (status === 400 || status === 401) {
        await patchAccount(descriptor.id, accountId, {
          needsReconsent: true,
          accessToken: undefined,
          expiresAt: undefined,
          lastRefreshError: {
            message: err instanceof Error ? err.message : String(err),
            at: Date.now(),
          },
        });
        throw new AuthNeedsConsentError({
          providerId: descriptor.id,
          reason: "needs-reconsent",
        });
      }
      await patchAccount(descriptor.id, accountId, {
        lastRefreshError: {
          message: err instanceof Error ? err.message : String(err),
          at: Date.now(),
        },
      });
      throw err;
    }
  })();
  inFlightRefreshes.set(key, promise);
  promise.finally(() => inFlightRefreshes.delete(key));
  return promise;
}

export interface GetAccessTokenArgs {
  providerId: string;
  accountId?: string;
  scopes?: string[];
}

/** Internal main-side token resolver. Returns a structured TokenResponse. */
export async function getAccessTokenInternal(
  args: GetAccessTokenArgs,
): Promise<TokenResponse> {
  const accountId = args.accountId ?? "primary";
  let descriptor: AuthProviderDescriptor;
  try {
    descriptor = getProvider(args.providerId);
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : String(err),
      code: "unknown-provider",
    };
  }

  const account = getAccount(args.providerId, accountId);
  if (!account) {
    return {
      ok: false,
      needsConsent: true,
      reason: "no-account",
    };
  }
  if (account.needsReconsent) {
    return {
      ok: false,
      needsConsent: true,
      reason: "needs-reconsent",
    };
  }

  if (account.kind === "apikey") {
    if (!account.apiKey) {
      return {
        ok: false,
        needsConsent: true,
        reason: "no-account",
      };
    }
    return {
      ok: true,
      accessToken: account.apiKey,
      expiresAt: Number.MAX_SAFE_INTEGER,
      scopes: [],
      identity: account.identity,
    };
  }

  if (args.scopes && args.scopes.length > 0) {
    const stored = account.scopes ?? [];
    if (!scopeSubset(args.scopes, stored)) {
      return {
        ok: false,
        needsConsent: true,
        reason: "missing-scopes",
        missingScopes: args.scopes.filter((s) => !stored.includes(s)),
      };
    }
  }

  const expiresAt = account.expiresAt ?? 0;
  if (account.accessToken && expiresAt > Date.now() + REFRESH_LEAD_MS) {
    return {
      ok: true,
      accessToken: account.accessToken,
      expiresAt,
      scopes: account.scopes ?? [],
      identity: account.identity,
    };
  }

  // Need a refresh.
  try {
    const refreshed = await refreshAccount(descriptor, accountId, account);
    if (!refreshed.accessToken || !refreshed.expiresAt) {
      return {
        ok: false,
        needsConsent: true,
        reason: "needs-reconsent",
      };
    }
    return {
      ok: true,
      accessToken: refreshed.accessToken,
      expiresAt: refreshed.expiresAt,
      scopes: refreshed.scopes ?? [],
      identity: refreshed.identity,
    };
  } catch (err) {
    if (err instanceof AuthNeedsConsentError) {
      return {
        ok: false,
        needsConsent: true,
        reason: err.reason,
        missingScopes: err.missingScopes,
      };
    }
    return {
      ok: false,
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Public consumer API. Throws AuthNeedsConsentError or generic Error for
 * non-consent failures. Callers (e.g. backup-gdrive) await this and use the
 * returned access token to make their own provider requests.
 *
 * Routes via unix socket on worktree namespaces; resolves locally on main.
 */
export async function getAccessToken(args: GetAccessTokenArgs): Promise<{
  accessToken: string;
  expiresAt: number;
  scopes: string[];
  identity: AuthIdentity;
}> {
  const result = isMain()
    ? await getAccessTokenInternal(args)
    : await rpcToken(args);

  if (result.ok) {
    return {
      accessToken: result.accessToken,
      expiresAt: result.expiresAt,
      scopes: result.scopes,
      identity: result.identity,
    };
  }
  if ("needsConsent" in result && result.needsConsent) {
    throw new AuthNeedsConsentError({
      providerId: args.providerId,
      reason: result.reason,
      missingScopes: result.missingScopes,
    });
  }
  throw new Error((result as { message: string }).message);
}

export async function getAccountIdentity(
  providerId: string,
  accountId = "primary",
): Promise<AuthIdentity | undefined> {
  const account = getAccount(providerId, accountId);
  return account?.identity;
}

export { listProviders };
