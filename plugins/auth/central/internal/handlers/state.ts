import type { HttpHandler } from "@central/types";
import { computeAuthState, warmAuthState } from "../auth-state";

/**
 * GET /api/auth/state
 *
 * Sanitized, secret-free view of the auth-state. Mirrors the resource loader.
 * Useful for debugging and cURL inspection; the UI uses authStateResource.
 */
export const handleGetState: HttpHandler = async () => {
  await warmAuthState();
  return Response.json(computeAuthState());
};
