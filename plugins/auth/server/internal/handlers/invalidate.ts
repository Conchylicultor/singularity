import type { HttpHandler } from "@server/types";
import { isMain } from "../paths";
import { invalidateAuthStateCache } from "../auth-state";
import { notifyAuthState } from "../auth-resource";
import { invalidateCredentialsCache } from "../credentials";

/**
 * POST /api/auth/invalidate
 *
 * On worktrees: triggered by main's fan-out. Refreshes local cache and pushes
 * to subscribed tabs. On main: 204 — main already notifies itself directly.
 */
export const handleInvalidate: HttpHandler = async () => {
  if (isMain()) {
    return new Response(null, { status: 204 });
  }
  invalidateCredentialsCache();
  invalidateAuthStateCache();
  notifyAuthState();
  return new Response(null, { status: 204 });
};
