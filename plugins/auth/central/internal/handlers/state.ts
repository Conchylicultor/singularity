import { implement } from "@plugins/infra/plugins/endpoints/core";
import { getAuthState } from "@plugins/auth/core";
import { computeAuthState, warmAuthState } from "../auth-state";

/**
 * GET /api/auth/state
 *
 * Sanitized, secret-free view of the auth-state. Mirrors the resource loader.
 * Useful for debugging and cURL inspection; the UI uses authStateResource.
 */
export const handleGetState = implement(getAuthState, async () => {
  await warmAuthState();
  return computeAuthState();
});
