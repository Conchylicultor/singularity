import type { AuthIdentity } from "./lib";

export interface GetAccessTokenArgs {
  providerId: string;
  accountId?: string;
  scopes?: string[];
}

export interface TokenSuccess {
  ok: true;
  accessToken: string;
  expiresAt: number;
  scopes: string[];
  identity: AuthIdentity;
}

export interface TokenNeedsConsent {
  ok: false;
  needsConsent: true;
  reason: "no-account" | "needs-reconsent" | "missing-scopes";
  missingScopes?: string[];
}

export interface TokenFailure {
  ok: false;
  needsConsent?: false;
  message: string;
  code?: string;
}

export type TokenResponse = TokenSuccess | TokenNeedsConsent | TokenFailure;
