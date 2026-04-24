import {
  defineAuthProvider,
  AuthCredentialsMissingError,
  type AuthIdentity,
  type AuthProviderDescriptor,
} from "@plugins/auth/shared";
import { readConfig } from "@plugins/config/server";
import { googleAuthConfig, GOOGLE_DEFAULT_SCOPES } from "../../shared";

interface GoogleUserInfo {
  sub: string;
  email?: string;
  name?: string;
  picture?: string;
}

async function fetchGoogleIdentity(
  accessToken: string,
): Promise<AuthIdentity> {
  const res = await fetch(
    "https://openidconnect.googleapis.com/v1/userinfo",
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!res.ok) {
    throw new Error(
      `google: userinfo ${res.status} ${await res.text().catch(() => "")}`,
    );
  }
  const info = (await res.json()) as GoogleUserInfo;
  return {
    accountId: info.sub,
    email: info.email,
    displayName: info.name,
    avatarUrl: info.picture,
  };
}

export const googleDescriptor: AuthProviderDescriptor = defineAuthProvider({
  id: "google",
  name: "Google",
  kind: "oauth2",
  oauth: {
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    defaultScopes: [...GOOGLE_DEFAULT_SCOPES],
    pkce: true,
    buildAuthorizeParams: () => ({
      // Required for refresh tokens. `prompt=consent` forces issuance even on
      // re-authorization, otherwise Google returns no refresh token after the
      // first grant.
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: "true",
    }),
    fetchIdentity: fetchGoogleIdentity,
    resolveCredentials: async (env) => {
      const fromEnv = env.get("SINGULARITY_AUTH_GOOGLE_CLIENT_ID");
      if (fromEnv) return { clientId: fromEnv };
      const cfg = await readConfig(googleAuthConfig);
      if (!cfg.clientId) {
        throw new AuthCredentialsMissingError("google");
      }
      return { clientId: cfg.clientId };
    },
  },
});
