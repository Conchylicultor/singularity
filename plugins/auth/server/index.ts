import type { ServerPluginDefinition } from "@server/types";
import { authRoutes } from "./internal/routes";
import { authStateResource } from "./internal/auth-resource";
import { onReady } from "./internal/boot";

export {
  getAccessToken,
  getAccountIdentity,
  listProviders,
} from "./internal/api";
export { registerAuthProvider } from "./internal/registry";
export { authStateResource } from "./internal/auth-resource";
export { defineAuthProvider } from "@plugins/auth/shared";
export type {
  AuthIdentity,
  AuthProviderDescriptor,
  AuthProviderKind,
  AuthStateValue,
  AuthAccountState,
  OAuth2Config,
  ApiKeyConfig,
  ResolvedCredentials,
  ParsedTokenResponse,
  AuthEnvAccessor,
} from "@plugins/auth/shared";
export {
  AuthError,
  AuthNeedsConsentError,
  AuthMainOfflineError,
  AuthProviderUnknownError,
  AuthCredentialsMissingError,
  AuthKeychainLockedError,
} from "@plugins/auth/shared";

export default {
  id: "auth",
  name: "Auth",
  description:
    "Shared OAuth/API-key infrastructure for third-party services. Tokens stored on main; worktrees fetch via unix socket.",
  httpRoutes: authRoutes,
  resources: [authStateResource],
  onReady,
} satisfies ServerPluginDefinition;
