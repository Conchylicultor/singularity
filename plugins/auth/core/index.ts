export { defineAuthProvider } from "./internal/lib";
export type {
  AuthProviderDescriptor,
  AuthProviderKind,
  OAuth2Config,
  ApiKeyConfig,
  AuthIdentity,
  AuthAccountState,
  AuthStateValue,
  AuthEnvAccessor,
  ResolvedCredentials,
  ParsedTokenResponse,
} from "./internal/lib";
export {
  AuthError,
  AuthNeedsConsentError,
  AuthProviderUnknownError,
  AuthKeychainLockedError,
  AuthCredentialsMissingError,
} from "./internal/errors";
export { authStateResource } from "./resources";
export type {
  GetAccessTokenArgs,
  TokenResponse,
  TokenSuccess,
  TokenNeedsConsent,
  TokenFailure,
} from "./internal/token-types";
