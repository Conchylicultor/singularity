import type { HttpHandler } from "@central/types";
import { disconnectAccount } from "../actions";

/** POST /api/auth/disconnect/:provider */
export const handleDisconnect: HttpHandler = async (req, params) => {
  const providerId = params.provider;
  if (!providerId) return new Response("missing provider id", { status: 400 });
  let body: { accountId?: string } = {};
  try {
    if (req.headers.get("content-length")) {
      body = (await req.json()) as { accountId?: string };
    }
  // eslint-disable-next-line promise-safety/no-bare-catch
  } catch {
    /* empty body is fine */
  }

  await disconnectAccount(providerId, body.accountId);
  return Response.json({ ok: true });
};
