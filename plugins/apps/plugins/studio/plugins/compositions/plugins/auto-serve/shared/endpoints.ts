import { z } from "zod";
import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";

// Shared endpoint contract for "Reset to first-launch" — imported by BOTH this
// plugin's own web (the confirm control) and its server (the handler). A plugin
// importing its own `shared/` is boundary-legal.
export const ResetCompositionBodySchema = z.object({ id: z.string() });
export type ResetCompositionBody = z.infer<typeof ResetCompositionBodySchema>;

export const resetCompositionData = defineEndpoint({
  route: "POST /api/studio/compositions/auto-serve/reset",
  body: ResetCompositionBodySchema,
  response: z.object({ ok: z.boolean() }),
});
