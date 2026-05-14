import type { CentralPluginDefinition } from "@central/types";
import { handleOAuthStart } from "./internal/handlers/oauth-start";
import { handleOAuthCallback } from "./internal/handlers/oauth-callback";
import { handleDisconnect } from "./internal/handlers/disconnect";
import { handleSetApiKey } from "./internal/handlers/api-key";
import { handleGetState } from "./internal/handlers/state";
import { handleGetToken } from "./internal/handlers/token";
import { authStateResource } from "./internal/auth-resource";
import { onReady } from "./internal/boot";

export {
  getAccessToken,
  getAccountIdentity,
  listProviders,
} from "./internal/token-access";
export { registerAuthProvider } from "./internal/registry";
export { authStateResource } from "./internal/auth-resource";
export { readGlobalConfig } from "./internal/global-config";
export { defineAuthProvider } from "@plugins/auth/core";
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
  GetAccessTokenArgs,
  TokenResponse,
  TokenSuccess,
  TokenNeedsConsent,
  TokenFailure,
} from "@plugins/auth/core";
export {
  AuthError,
  AuthNeedsConsentError,
  AuthProviderUnknownError,
  AuthCredentialsMissingError,
  AuthKeychainLockedError,
} from "@plugins/auth/core";

export default {
  id: "auth",
  name: "Auth",
  description:
    "Centralized OAuth/API-key infrastructure for third-party services. Tokens persist via the central secrets store; auth runs on the central runtime so all worktrees share one connected state.",
  httpRoutes: {
    "GET /api/auth/start/:provider": handleOAuthStart,
    "GET /api/auth/callback/:provider": handleOAuthCallback,
    "POST /api/auth/disconnect/:provider": handleDisconnect,
    "POST /api/auth/api-key/:provider": handleSetApiKey,
    "GET /api/auth/state": handleGetState,
    "POST /api/auth/token": handleGetToken,
  },
  resources: [authStateResource],
  onReady,
} satisfies CentralPluginDefinition;
