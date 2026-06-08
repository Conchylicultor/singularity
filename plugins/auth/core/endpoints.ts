import { z } from "zod";
import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";
import { AuthStateValueSchema } from "./resources";

export const DisconnectBodySchema = z.object({
  accountId: z.string().optional(),
});
export type DisconnectBody = z.infer<typeof DisconnectBodySchema>;

const AuthIdentitySchema = z.object({
  accountId: z.string(),
  email: z.string().optional(),
  displayName: z.string().optional(),
  avatarUrl: z.string().optional(),
});

// Discriminated union mirroring TokenResponse (token-types.ts) on the wire.
const TokenResponseSchema = z.union([
  z.object({
    ok: z.literal(true),
    accessToken: z.string(),
    expiresAt: z.number(),
    scopes: z.array(z.string()),
    identity: AuthIdentitySchema,
  }),
  z.object({
    ok: z.literal(false),
    needsConsent: z.literal(true),
    reason: z.enum(["no-account", "needs-reconsent", "missing-scopes"]),
    missingScopes: z.array(z.string()).optional(),
  }),
  z.object({
    ok: z.literal(false),
    needsConsent: z.literal(false).optional(),
    message: z.string(),
    code: z.string().optional(),
  }),
]);

export const SetApiKeyBodySchema = z.object({
  apiKey: z.string(),
});
export type SetApiKeyBody = z.infer<typeof SetApiKeyBodySchema>;

export const GetTokenBodySchema = z.object({
  providerId: z.string(),
  accountId: z.string().optional(),
  scopes: z.array(z.string()).optional(),
});
export type GetTokenBody = z.infer<typeof GetTokenBodySchema>;

// OAuth start/callback return HTML/redirects — defined for route key only, NOT wrapped in implement()
export const oauthStart = defineEndpoint({
  route: "GET /api/auth/start/:provider",
});

export const oauthCallback = defineEndpoint({
  route: "GET /api/auth/callback/:provider",
});

export const disconnect = defineEndpoint({
  route: "POST /api/auth/disconnect/:provider",
  body: DisconnectBodySchema,
});

export const setApiKey = defineEndpoint({
  route: "POST /api/auth/api-key/:provider",
  body: SetApiKeyBodySchema,
  response: z.object({ ok: z.literal(true), identity: AuthIdentitySchema }),
});

export const getAuthState = defineEndpoint({
  route: "GET /api/auth/state",
  response: AuthStateValueSchema,
});

export const getToken = defineEndpoint({
  route: "POST /api/auth/token",
  body: GetTokenBodySchema,
  response: TokenResponseSchema,
});
