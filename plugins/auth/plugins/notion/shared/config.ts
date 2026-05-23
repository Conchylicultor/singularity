import { defineConfig } from "@plugins/config_v2/core";
import { secretField } from "@plugins/config_v2/plugins/fields/plugins/secret/core";

export const notionAuthConfig = defineConfig({
  name: "auth-notion",
  fields: {
    clientId: secretField({
      label: "Integration Client ID",
      description:
        "Notion integration client ID (https://www.notion.so/my-integrations).",
    }),
    clientSecret: secretField({
      label: "Integration Client Secret",
      description: "Notion integration client secret.",
    }),
  },
});
