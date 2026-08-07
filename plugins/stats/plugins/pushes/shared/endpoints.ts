import { z } from "zod";
import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";

// `bucket` is modeled as a plain optional string enum, with the defaulting done
// in the handler rather than the schema. An omitted param is dropped client-side
// and read as undefined; handlers default it to "day".
const bucketQuery = z.enum(["day", "week", "month"]).optional();

export const getPushesWaitTime = defineEndpoint({
  route: "GET /api/stats/pushes/wait-time",
  query: z.object({ bucket: bucketQuery }),
  response: z.object({
    points: z.array(
      z.object({
        bucket: z.string(),
        avg: z.number(),
        max: z.number(),
        contested: z.number(),
        total: z.number(),
      }),
    ),
  }),
});

export const getPushesThroughput = defineEndpoint({
  route: "GET /api/stats/pushes/throughput",
  query: z.object({ bucket: bucketQuery }),
  response: z.object({
    points: z.array(
      z.object({
        bucket: z.string(),
        success: z.number(),
        failed: z.number(),
      }),
    ),
  }),
});

export const getPushesStepBreakdown = defineEndpoint({
  route: "GET /api/stats/pushes/step-breakdown",
  query: z.object({ bucket: bucketQuery }),
  response: z.object({
    points: z.array(
      z.object({
        bucket: z.string(),
        fetch: z.number(),
        rebase: z.number(),
        checks: z.number(),
        push: z.number(),
        other: z.number(),
      }),
    ),
  }),
});
