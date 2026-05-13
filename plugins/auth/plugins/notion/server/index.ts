import type { ServerPluginDefinition } from "@server/types";
import { Config } from "@plugins/config/server";
import { notionAuthConfig } from "@plugins/auth/plugins/notion/shared";

// Worktree-side registration carrier for the config schema only — the OAuth
// runtime lives in `../central/`. See `../google/server/index.ts` for the
// full rationale.
export default {
  id: "auth-notion",
  name: "Auth: Notion",
  contributions: [Config.Field(notionAuthConfig)],
} satisfies ServerPluginDefinition;
