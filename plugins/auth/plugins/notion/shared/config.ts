import { defineConfig } from "@plugins/config/shared";

/**
 * Notion OAuth client credentials. Notion requires both clientId and
 * clientSecret (web integration; no PKCE-only Desktop equivalent).
 *
 * SCAFFOLD: not yet wired end-to-end. See plugins/auth/plugins/notion/CLAUDE.md.
 */
export const notionAuthConfig = defineConfig({
  clientId: {
    default: "",
    label: "Integration Client ID",
    description:
      "Notion integration client ID (https://www.notion.so/my-integrations).",
  },
  clientSecret: {
    default: "",
    label: "Integration Client Secret",
    description: "Notion integration client secret (kept on main only).",
  },
});
