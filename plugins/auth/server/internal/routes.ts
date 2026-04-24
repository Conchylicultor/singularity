import type { HttpHandler } from "@server/types";
import { handleOAuthStart } from "./handlers/oauth-start";
import { handleOAuthCallback } from "./handlers/oauth-callback";
import { handleDisconnect } from "./handlers/disconnect";
import { handleSetApiKey } from "./handlers/api-key";
import { handleInvalidate } from "./handlers/invalidate";
import { handleGetState } from "./handlers/state";

export const authRoutes: Record<string, HttpHandler> = {
  "GET /api/auth/start/:provider": handleOAuthStart,
  "GET /api/auth/callback/:provider": handleOAuthCallback,
  "POST /api/auth/disconnect/:provider": handleDisconnect,
  "POST /api/auth/api-key/:provider": handleSetApiKey,
  "POST /api/auth/invalidate": handleInvalidate,
  "GET /api/auth/state": handleGetState,
};
