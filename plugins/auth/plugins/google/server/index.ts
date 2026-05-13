import type { ServerPluginDefinition } from "@server/types";
import { Config } from "@plugins/config/server";
import { googleAuthConfig } from "@plugins/auth/plugins/google/shared";

// Worktree-side registration carrier. The OAuth runtime (descriptor, refresh
// loop, token store) lives in `../central/`. This stub exists solely so the
// config plugin's registry — which discovers Config.Field contributions — can
// render the Google credentials section in the per-worktree Settings UI and
// migrate plaintext secrets into the secrets store. No HTTP routes, no onReady,
// no internal/.
export default {
  id: "auth-google",
  name: "Auth: Google",
  contributions: [Config.Field(googleAuthConfig)],
} satisfies ServerPluginDefinition;
