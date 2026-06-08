import { z } from "zod";
import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";

export const getPushProfiling = defineEndpoint({
  route: "GET /api/debug/profiling/push",
  query: z.object({
    since: z.coerce.number().optional(),
    worktree: z.string().optional(),
    padding: z.coerce.number().optional(),
  }),
});

export interface PushStep {
  name: string;
  startMs: number;
  durationMs: number;
}

export interface PushDetail {
  pushId: string;
  branch: string;
  outcome: string;
  mode: "worktree" | "from-main";
  conversationId: string | null;
  startedAt: string;
  lockRequestedAt: string;
  lockAcquiredAt: string;
  completedAt: string | null;
  preLockMs: number;
  waitMs: number;
  holdMs: number;
  totalMs: number;
  interrupted: boolean;
  steps: PushStep[];
}

export const getPushDetail = defineEndpoint({
  route: "GET /api/debug/profiling/push/:pushId",
});
