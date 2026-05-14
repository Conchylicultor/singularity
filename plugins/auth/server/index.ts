import type { ServerPluginDefinition } from "@server/types";

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
  id: "auth",
  name: "Auth",
  description:
    "Worktree-side auth helpers. Provides getTokenFromCentral() for worktree plugins that need OAuth tokens.",
} satisfies ServerPluginDefinition;
