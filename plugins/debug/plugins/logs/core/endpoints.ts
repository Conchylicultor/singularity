import { z } from "zod";
import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";

export const getLogChannels = defineEndpoint({
  route: "GET /api/logs/channels",
  response: z.object({ channels: z.array(z.string()) }),
});

export const EmitLogsBodySchema = z.object({
  channel: z.string().min(1).max(128),
  lines: z
    .array(
      z.object({
        line: z.string(),
        stream: z.enum(["stdout", "stderr"]).optional(),
        t: z.number(), // client emit time (ms) — preserved on disk
      }),
    )
    .min(1)
    .max(500),
});
export type EmitLogsBody = z.infer<typeof EmitLogsBodySchema>;

export const emitLogs = defineEndpoint({
  route: "POST /api/logs/emit",
  body: EmitLogsBodySchema,
});
