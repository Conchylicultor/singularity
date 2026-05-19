import { defineResource } from "@plugins/framework/plugins/central-core/core";
import { z } from "zod";
import type { AuthStateValue, AuthAccountState } from "@plugins/auth/core";
import { computeAuthState, warmAuthState } from "./auth-state";

const AuthIdentitySchema = z.object({
  accountId: z.string(),
  email: z.string().optional(),
  displayName: z.string().optional(),
  avatarUrl: z.string().optional(),
});

const AuthAccountStateSchema = z.object({
  connected: z.boolean(),
  kind: z.enum(["oauth2", "apikey"]),
  credentialsConfigured: z.boolean(),
  identity: AuthIdentitySchema.optional(),
  scopes: z.array(z.string()).optional(),
  needsReconsent: z.boolean().optional(),
  connectedAt: z.number().optional(),
  lastRefreshError: z
    .object({ message: z.string(), at: z.number() })
    .optional(),
}) satisfies z.ZodType<AuthAccountState>;

const AuthStateValueSchema = z.object({
  mainOffline: z.boolean().optional(),
  providers: z.record(AuthAccountStateSchema),
}) satisfies z.ZodType<AuthStateValue>;

export const authStateResource = defineResource<AuthStateValue>({
  key: "auth-state",
  mode: "push",
  schema: AuthStateValueSchema,
  loader: async () => {
    await warmAuthState();
    return computeAuthState();
  },
});

export function notifyAuthState(): void {
  authStateResource.notify();
}
