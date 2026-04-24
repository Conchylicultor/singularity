import { defineConfig } from "@plugins/config/shared";

/**
 * Google OAuth client credentials. Users register a Desktop application client
 * in Google Cloud Console and paste both ID and secret here.
 *
 * Google's Desktop-app flow requires `client_secret` at the token endpoint
 * even when PKCE is used — this is Google's implementation choice (they treat
 * the "public" secret as a soft authentication factor embedded in the client
 * binary). The `clientSecret` field stores encrypted on main only and is never
 * broadcast to worktree browsers.
 *
 * Env-var overrides (development):
 *   SINGULARITY_AUTH_GOOGLE_CLIENT_ID=...
 *   SINGULARITY_AUTH_GOOGLE_CLIENT_SECRET=...
 */
export const googleAuthConfig = defineConfig({
  clientId: {
    default: "",
    label: "OAuth Client ID",
    description:
      "Desktop-app client ID from Google Cloud Console. Add http://localhost:9000/api/auth/callback/google as the Authorized redirect URI.",
  },
  clientSecret: {
    default: "",
    secret: true,
    label: "OAuth Client Secret",
    description:
      "Desktop-app client secret from Google Cloud Console. Required by Google's token endpoint even with PKCE. Stored encrypted on main only.",
  },
});
