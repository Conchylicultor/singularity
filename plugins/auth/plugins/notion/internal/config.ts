import { defineConfig } from "@plugins/config/core";

/**
 * Notion OAuth client credentials. Notion requires both clientId and
 * clientSecret (web integration; no PKCE-only Desktop equivalent).
 *
 * Both fields use `secret: true` so they live in the central secrets store
 * (one global value across all worktrees) — auth runs on the central runtime
 * and reads them directly from secrets.
 *
 * SCAFFOLD: not yet wired end-to-end. See plugins/auth/plugins/notion/CLAUDE.md.
 */
export const notionAuthConfig = defineConfig({
  clientId: {
    default: "",
    secret: true,
    label: "Integration Client ID",
    description:
      "Notion integration client ID (https://www.notion.so/my-integrations).",
  },
  clientSecret: {
    default: "",
    secret: true,
    label: "Integration Client Secret",
    description: "Notion integration client secret.",
  },
});
