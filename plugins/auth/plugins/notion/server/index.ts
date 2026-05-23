import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { ConfigV2 } from "@plugins/config_v2/server";
import { notionAuthConfig } from "../shared";

// Worktree-side registration carrier for the config schema only — the OAuth
// runtime lives in `../central/`. See `../google/server/index.ts` for the
// full rationale.
export default {
  id: "auth-notion",
  name: "Auth: Notion",
  contributions: [ConfigV2.Register({ descriptor: notionAuthConfig })],
} satisfies ServerPluginDefinition;
