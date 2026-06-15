import { z } from "zod";
import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";
import { LinkPreviewSchema } from "./schemas";

export const linkPreviewEndpoint = defineEndpoint({
  route: "GET /api/link-preview",
  query: z.object({ url: z.string() }),
  response: LinkPreviewSchema,
});
