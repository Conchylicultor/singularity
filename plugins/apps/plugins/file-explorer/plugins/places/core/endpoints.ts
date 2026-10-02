import { z } from "zod";
import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";

/**
 * The Singularity main checkout on this machine (`getMainRepoRoot`), absolute —
 * what the "Singularity" place opens. Only the server knows where it is.
 */
export const fileExplorerCheckout = defineEndpoint({
  route: "GET /api/file-explorer/checkout",
  response: z.object({ path: z.string() }),
});
