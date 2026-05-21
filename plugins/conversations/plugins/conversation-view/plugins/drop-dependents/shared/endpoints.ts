import { z } from "zod";
import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";

export const dropDependents = defineEndpoint({
  route: "POST /api/conversations/:id/drop-dependents",
  response: z.object({ ok: z.boolean(), dropped: z.number() }),
});
