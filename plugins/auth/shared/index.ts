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
  AuthMainOfflineError,
  AuthProviderUnknownError,
  AuthKeychainLockedError,
  AuthCredentialsMissingError,
} from "./internal/errors";
export { authStateResource } from "./resources";
