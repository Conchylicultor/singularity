import type { HttpHandler } from "@server/types";
import { isMain } from "../paths";
import { rpcDisconnect } from "../unix-rpc/client";
import { disconnectAccount } from "../actions";

/**
 * POST /api/auth/disconnect/:provider
 *
 * On main: deletes locally and fans out. On worktrees: proxies to main via
 * the unix socket and fan-out from main pushes the resource invalidation back.
 */
export const handleDisconnect: HttpHandler = async (req, params) => {
  const providerId = params.provider;
  if (!providerId) return new Response("missing provider id", { status: 400 });
  let body: { accountId?: string } = {};
  try {
    if (req.headers.get("content-length")) {
      body = (await req.json()) as { accountId?: string };
    }
  } catch {
    /* empty body is fine */
  }

  if (isMain()) {
    await disconnectAccount(providerId, body.accountId);
  } else {
    await rpcDisconnect({ providerId, accountId: body.accountId });
  }
  return Response.json({ ok: true });
};
