import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";

export {
  getTokenFromCentral,
  AuthCentralOfflineError,
} from "./internal/get-token";
export type {
  GetAccessTokenArgs,
  TokenResponse,
  TokenSuccess,
  TokenNeedsConsent,
  TokenFailure,
} from "@plugins/auth/core";

export default {
  name: "Auth",
  description:
    "Worktree-side auth helpers. Provides getTokenFromCentral() for worktree plugins that need OAuth tokens.",
} satisfies ServerPluginDefinition;
