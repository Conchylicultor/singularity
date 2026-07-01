import { defineConfig } from "@plugins/config_v2/core";
import { secretField } from "@plugins/fields/plugins/secret/plugins/config/core";
import { textField } from "@plugins/fields/plugins/text/plugins/config/core";

// One config descriptor mixing secret and non-secret fields (mirrors
// `googleAuthConfig`). Secret fields persist to the encrypted secrets store
// (namespace `config-fields`, key `apple-signing.<field>`) and expose only
// `{ set: boolean }` to the browser via `configV2SecretMetaResource`. Text
// fields persist to config_v2 JSONC and are readable in the browser.
export const appleSigningConfig = defineConfig({
  name: "apple-signing",
  fields: {
    p12Cert: secretField({
      label: "Developer ID certificate (.p12)",
      description: "Base64 of the exported .p12 (cert + private key).",
    }),
    p12Password: secretField({ label: "Certificate password" }),
    ascApiKey: secretField({ label: "App Store Connect API key (.p8)" }),
    signingIdentity: textField({ label: "Signing identity" }),
    ascKeyId: textField({ label: "API Key ID" }),
    ascIssuerId: textField({ label: "API Issuer ID" }),
  },
});
