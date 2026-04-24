import type {
  AuthIdentity,
  AuthStateValue,
} from "@plugins/auth/shared";

/** Request to obtain (or refresh) an access token. */
export interface TokenRequest {
  providerId: string;
  accountId?: string;
  scopes?: string[];
}

export interface TokenSuccessResponse {
  ok: true;
  accessToken: string;
  expiresAt: number;
  scopes: string[];
  identity: AuthIdentity;
}

export interface TokenNeedsConsentResponse {
  ok: false;
  needsConsent: true;
  reason: "no-account" | "needs-reconsent" | "missing-scopes";
  missingScopes?: string[];
}

export interface TokenErrorResponse {
  ok: false;
  needsConsent?: false;
  message: string;
  code?: string;
}

export type TokenResponse =
  | TokenSuccessResponse
  | TokenNeedsConsentResponse
  | TokenErrorResponse;

export interface DisconnectRequest {
  providerId: string;
  accountId?: string;
}

export interface DisconnectResponse {
  ok: true;
}

export interface ApiKeySetRequest {
  providerId: string;
  apiKey: string;
}

export interface ApiKeySetResponse {
  ok: true;
  identity: AuthIdentity;
}

/** GET /status — returns the public AuthStateValue for cross-worktree clients. */
export type StatusResponse = AuthStateValue;

export const RPC_PATHS = {
  token: "/token",
  status: "/status",
  disconnect: "/disconnect",
  apiKey: "/api-key",
} as const;
