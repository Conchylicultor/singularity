import { z } from "zod";
import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";
import { GetHealthDataResponseSchema } from "./schema";

// Served by the MAIN backend. It reads every worktree's health JSONL straight
// from disk, so it answers even when a worktree backend is wedged — unlike
// get_runtime_profile, which proxies the live backend and 404s when it stalls.
export const getHealthData = defineEndpoint({
  route: "GET /api/debug/health-monitor",
  query: z.object({ windowMs: z.coerce.number().optional() }),
  response: GetHealthDataResponseSchema,
  dedupe: true,
});
