import type { HttpHandler } from "@server/types";
import { isMain } from "../paths";
import { computeAuthState, warmAuthState } from "../auth-state";
import { rpcStatus } from "../unix-rpc/client";

/**
 * GET /api/auth/state
 *
 * Sanitized, secret-free view of the auth-state. Mirrors the resource loader.
 * Useful for debugging and cURL inspection; the UI uses authStateResource.
 */
export const handleGetState: HttpHandler = async () => {
  if (isMain()) {
    await warmAuthState();
    return Response.json(computeAuthState());
  }
  try {
    return Response.json(await rpcStatus());
  } catch (err) {
    return Response.json(
      { mainOffline: true, providers: {}, message: err instanceof Error ? err.message : String(err) },
      { status: 503 },
    );
  }
};
