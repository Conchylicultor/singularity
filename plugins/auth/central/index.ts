import type { CentralPluginDefinition } from "@plugins/framework/plugins/central-core/core";
import { handleOAuthStart } from "./internal/handlers/oauth-start";
import { handleOAuthCallback } from "./internal/handlers/oauth-callback";
import { handleDisconnect } from "./internal/handlers/disconnect";
import { handleSetApiKey } from "./internal/handlers/api-key";
import { handleGetState } from "./internal/handlers/state";
import { handleGetToken } from "./internal/handlers/token";
import { authStateResource } from "./internal/auth-resource";
import { onReady } from "./internal/boot";
import {
  oauthStart,
  oauthCallback,
  disconnect,
  setApiKey,
  getAuthState,
  getToken,
} from "@plugins/auth/core";

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
    [oauthStart.route]: handleOAuthStart,
    [oauthCallback.route]: handleOAuthCallback,
    [disconnect.route]: handleDisconnect,
    [setApiKey.route]: handleSetApiKey,
    [getAuthState.route]: handleGetState,
    [getToken.route]: handleGetToken,
  },
  resources: [authStateResource],
  onReady,
} satisfies CentralPluginDefinition;
