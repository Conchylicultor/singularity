import type { HttpHandler } from "@central/types";
import { setApiKey } from "../actions";

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
    const identity = await setApiKey(providerId, body.apiKey);
    return Response.json({ ok: true, identity });
  } catch (err) {
    return Response.json(
      { ok: false, message: err instanceof Error ? err.message : String(err) },
      { status: 400 },
    );
  }
};
