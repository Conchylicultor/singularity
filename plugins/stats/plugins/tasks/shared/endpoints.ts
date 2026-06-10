import { z } from "zod";
import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";

const cumulativePoint = z.object({
  date: z.string(),
  total: z.number(),
  active: z.number(),
  completed: z.number(),
  dropped: z.number(),
});

export const getTasksCumulative = defineEndpoint({
  route: "GET /api/stats/tasks/cumulative",
  response: z.object({ points: z.array(cumulativePoint) }),
});

const dailyPoint = z.object({
  date: z.string(),
  added: z.number(),
  completed: z.number(),
  dropped: z.number(),
  net: z.number(),
});

export const getTasksDaily = defineEndpoint({
  route: "GET /api/stats/tasks/daily",
  response: z.object({ points: z.array(dailyPoint) }),
});
