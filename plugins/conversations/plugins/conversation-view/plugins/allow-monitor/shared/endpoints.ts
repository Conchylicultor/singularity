import { z } from "zod";
import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";

export const getAllowFiles = defineEndpoint({
  route: "GET /api/conversations/:id/allow-files",
  response: z.object({ allowFiles: z.array(z.string()) }),
});
