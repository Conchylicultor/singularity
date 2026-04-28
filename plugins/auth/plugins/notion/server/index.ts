import type { ServerPluginDefinition } from "@server/types";
import { notionAuthConfig } from "../shared";

// Worktree-side registration carrier for the config schema only — the OAuth
// runtime lives in `../central/`. See `../google/server/index.ts` for the
// full rationale.
export default {
  id: "auth-notion",
  name: "Auth: Notion",
  config: notionAuthConfig,
} satisfies ServerPluginDefinition;
