import { defineConfig } from "@plugins/config_v2/core";
import { boolField } from "@plugins/fields/plugins/bool/plugins/config/core";

export const gmailConfig = defineConfig({
  fields: {
    enabled: boolField({
      default: false,
      label: "Enable Gmail access",
      description:
        "Request Gmail access on your Google connection. Once enabled, grant access from Settings → Accounts. Other plugins can then call the Gmail API with your token.",
    }),
  },
});
