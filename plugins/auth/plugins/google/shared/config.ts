import { defineConfig } from "@plugins/config/core";

/**
 * Google OAuth client credentials. Users register a Desktop application client
 * in Google Cloud Console and paste both ID and secret here.
 *
 * Both fields use `secret: true` so they live in the central secrets store
 * (one global value across all worktrees), not in any single worktree's
 * Postgres config table — auth runs on the central runtime and reads them
 * directly from secrets. The "secret" marker also keeps the values out of
 * worktree DBs and browser broadcasts.
 *
 * Env-var overrides (development):
 *   SINGULARITY_AUTH_GOOGLE_CLIENT_ID=...
 *   SINGULARITY_AUTH_GOOGLE_CLIENT_SECRET=...
 */
export const googleAuthConfig = defineConfig({
  clientId: {
    default: "",
    secret: true,
    label: "OAuth Client ID",
    description:
      "Desktop-app client ID from Google Cloud Console. Add http://localhost:9000/api/auth/callback/google as the Authorized redirect URI.",
  },
  clientSecret: {
    default: "",
    secret: true,
    label: "OAuth Client Secret",
    description:
      "Desktop-app client secret from Google Cloud Console. Required by Google's token endpoint even with PKCE.",
  },
});
