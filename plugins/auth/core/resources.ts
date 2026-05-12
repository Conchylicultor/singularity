import { z } from "zod";
import { centralResourceDescriptor } from "@plugins/primitives/plugins/live-state/core";
import type { AuthStateValue, AuthAccountState } from "./internal/lib";

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

export const AuthStateValueSchema = z.object({
  mainOffline: z.boolean().optional(),
  providers: z.record(AuthAccountStateSchema),
}) satisfies z.ZodType<AuthStateValue>;

/**
 * Web-facing typed view of the auth state resource. Marked `origin: "central"`
 * so the browser's NotificationsClient subscribes via `/ws/central-notifications`
 * — auth tokens live on the central runtime, shared across all worktrees.
 */
export const authStateResource = centralResourceDescriptor<AuthStateValue>(
  "auth-state",
  AuthStateValueSchema,
  { providers: {} },
);
