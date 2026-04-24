export type AuthProviderKind = "oauth2" | "apikey";

export interface AuthIdentity {
  accountId: string;
  email?: string;
  displayName?: string;
  avatarUrl?: string;
}

export interface AuthEnvAccessor {
  get(key: string): string | undefined;
}

export interface ResolvedCredentials {
  clientId: string;
  clientSecret?: string;
}

export interface ParsedTokenResponse {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
  scopes?: string[];
  idToken?: string;
}

export interface OAuth2Config {
  authorizeUrl: string;
  tokenUrl: string;
  defaultScopes: string[];
  scopeSeparator?: string;
  pkce?: boolean;
  buildAuthorizeParams?: (ctx: {
    scopes: string[];
    state: string;
    redirectUri: string;
    codeChallenge?: string;
  }) => Record<string, string>;
  parseTokenResponse?: (raw: unknown) => ParsedTokenResponse;
  fetchIdentity: (accessToken: string) => Promise<AuthIdentity>;
  revoke?: (args: {
    accessToken?: string;
    refreshToken?: string;
  }) => Promise<void>;
  resolveCredentials: (env: AuthEnvAccessor) => Promise<ResolvedCredentials>;
}

export interface ApiKeyConfig {
  pattern?: RegExp;
  help?: string;
  verify?: (apiKey: string) => Promise<AuthIdentity>;
}

export interface AuthProviderDescriptor {
  id: string;
  name: string;
  kind: AuthProviderKind;
  oauth?: OAuth2Config;
  apiKey?: ApiKeyConfig;
}

/**
 * Identity helper. The descriptor is just data — this function is the
 * canonical way for provider plugins to construct one. Validates that the
 * `kind` matches the provided config branch.
 */
export function defineAuthProvider(
  descriptor: AuthProviderDescriptor,
): AuthProviderDescriptor {
  if (descriptor.kind === "oauth2" && !descriptor.oauth) {
    throw new Error(
      `defineAuthProvider("${descriptor.id}"): kind="oauth2" requires .oauth`,
    );
  }
  if (descriptor.kind === "apikey" && !descriptor.apiKey) {
    throw new Error(
      `defineAuthProvider("${descriptor.id}"): kind="apikey" requires .apiKey`,
    );
  }
  if (!/^[a-z][a-z0-9-]*$/.test(descriptor.id)) {
    throw new Error(
      `defineAuthProvider("${descriptor.id}"): id must match /^[a-z][a-z0-9-]*$/`,
    );
  }
  return descriptor;
}

// ---------------------------------------------------------------------------
// State payload (broadcast to web clients via authStateResource).
// MUST NEVER include secret material (accessToken, refreshToken, apiKey).
// ---------------------------------------------------------------------------

export interface AuthAccountState {
  connected: boolean;
  kind: AuthProviderKind;
  credentialsConfigured: boolean;
  identity?: AuthIdentity;
  scopes?: string[];
  needsReconsent?: boolean;
  connectedAt?: number;
  lastRefreshError?: { message: string; at: number };
}

export interface AuthStateValue {
  mainOffline?: boolean;
  providers: { [providerId: string]: AuthAccountState };
}
