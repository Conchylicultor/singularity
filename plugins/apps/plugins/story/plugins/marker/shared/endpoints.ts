import { z } from "zod";
import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";

const SetStoryMarkBodySchema = z.object({
  defaultRendererId: z.string().nullable().optional(),
});

export const setStoryMark = defineEndpoint({
  route: "PUT /api/stories/:pageId",
  body: SetStoryMarkBodySchema,
});

export const clearStoryMark = defineEndpoint({
  route: "DELETE /api/stories/:pageId",
});
