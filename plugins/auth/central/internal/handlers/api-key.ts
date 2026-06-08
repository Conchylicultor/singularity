import { implement, HttpError } from "@plugins/infra/plugins/endpoints/core";
import { setApiKey as setApiKeyEndpoint } from "@plugins/auth/core";
import { setApiKey } from "../actions";

/**
 * POST /api/auth/api-key/:provider
 * Body: { apiKey: string }
 */
export const handleSetApiKey = implement(setApiKeyEndpoint, async ({ params, body }) => {
  try {
    const identity = await setApiKey(params.provider, body.apiKey);
    return { ok: true as const, identity };
  } catch (err) {
    throw new HttpError(400, err instanceof Error ? err.message : String(err));
  }
});
