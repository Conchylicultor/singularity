import { z } from "zod";
import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";

export const DisconnectBodySchema = z.object({
  accountId: z.string().optional(),
});
export type DisconnectBody = z.infer<typeof DisconnectBodySchema>;

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
});

export const getAuthState = defineEndpoint({
  route: "GET /api/auth/state",
});

export const getToken = defineEndpoint({
  route: "POST /api/auth/token",
  body: GetTokenBodySchema,
});
