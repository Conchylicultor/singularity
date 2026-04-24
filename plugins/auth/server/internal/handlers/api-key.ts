import type { HttpHandler } from "@server/types";
import { isMain } from "../paths";
import { setApiKey } from "../actions";
import { rpcSetApiKey } from "../unix-rpc/client";

/**
 * POST /api/auth/api-key/:provider
 * Body: { apiKey: string }
 */
export const handleSetApiKey: HttpHandler = async (req, params) => {
  const providerId = params.provider;
  if (!providerId) return new Response("missing provider id", { status: 400 });
  const body = (await req.json()) as { apiKey?: string };
  if (!body.apiKey) {
    return new Response("missing apiKey in body", { status: 400 });
  }
  try {
    const identity = isMain()
      ? await setApiKey(providerId, body.apiKey)
      : (await rpcSetApiKey({ providerId, apiKey: body.apiKey })).identity;
    return Response.json({ ok: true, identity });
  } catch (err) {
    return Response.json(
      { ok: false, message: err instanceof Error ? err.message : String(err) },
      { status: 400 },
    );
  }
};
