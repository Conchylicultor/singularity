import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { ConfigV2 } from "@plugins/config_v2/server";
import { googleAuthConfig } from "../shared";

// Worktree-side registration carrier. The OAuth runtime (descriptor, refresh
// loop, token store) lives in `../central/`. This stub exists solely so the
// config plugin's registry — which discovers ConfigV2.Register contributions — can
// render the Google credentials section in the per-worktree Settings UI.
// No HTTP routes, no onReady, no internal/.
export default {
  contributions: [ConfigV2.Register({ descriptor: googleAuthConfig })],
} satisfies ServerPluginDefinition;
