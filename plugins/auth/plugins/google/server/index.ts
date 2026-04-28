import type { ServerPluginDefinition } from "@server/types";
import { googleAuthConfig } from "../shared";

// Worktree-side registration carrier. The OAuth runtime (descriptor, refresh
// loop, token store) lives in `../central/`. This stub exists solely so the
// config plugin's registry — which walks `@server/plugins` to discover
// `config:` schemas — can render the Google credentials section in the
// per-worktree Settings UI and migrate plaintext secrets into the secrets
// store. No HTTP routes, no onReady, no internal/.
export default {
  id: "auth-google",
  name: "Auth: Google",
  config: googleAuthConfig,
} satisfies ServerPluginDefinition;
