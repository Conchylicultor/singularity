import { z } from "zod";
import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";

const MemoryFileSchema = z.object({
  name: z.string(),
  type: z.enum(["index", "feedback", "project", "user", "reference", "other"]),
});

export const listMemoryFiles = defineEndpoint({
  route: "GET /api/debug/memory",
  response: z.object({
    ok: z.boolean(),
    files: z.array(MemoryFileSchema),
    dir: z.string(),
  }),
});

export const readMemoryFile = defineEndpoint({
  route: "GET /api/debug/memory/:name",
  response: z.object({ ok: z.boolean(), content: z.string() }),
});
