import { defineConfig } from "@plugins/config_v2/core";
import { secretField } from "@plugins/fields/plugins/secret/plugins/config/core";

export const googleAuthConfig = defineConfig({
  name: "auth-google",
  fields: {
    clientId: secretField({
      label: "OAuth Client ID",
      description:
        "Desktop-app client ID from Google Cloud Console. Add http://localhost:9000/api/auth/callback/google as the Authorized redirect URI.",
    }),
    clientSecret: secretField({
      label: "OAuth Client Secret",
      description:
        "Desktop-app client secret from Google Cloud Console. Required by Google's token endpoint even with PKCE.",
    }),
  },
});
