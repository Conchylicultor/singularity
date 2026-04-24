import { defineConfig } from "@plugins/config/shared";

/**
 * Google OAuth client credentials. Users register a Desktop application client
 * in Google Cloud Console and paste the client ID here. No client secret is
 * required because Desktop clients use PKCE (RFC 7636).
 *
 * Env-var override (development):
 *   SINGULARITY_AUTH_GOOGLE_CLIENT_ID=...
 */
export const googleAuthConfig = defineConfig({
  clientId: {
    default: "",
    label: "OAuth Client ID",
    description:
      "Desktop-app client ID from Google Cloud Console. Add http://localhost:9000/api/auth/callback/google as the Authorized redirect URI. No client secret needed (PKCE).",
  },
});
