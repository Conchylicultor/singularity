import { z } from "zod";
import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";

// A generation request is a *turn*: the renderer assembles the full prompt
// client-side (it owns format + context), and the server stays format-agnostic.
export const generateUnit = defineEndpoint({
  route: "POST /api/story/generate/:pageId/:kind/:unitId",
  body: z.object({
    prompt: z.string(),
    inputHash: z.string(),
    instruction: z.string().optional(),
  }),
});
