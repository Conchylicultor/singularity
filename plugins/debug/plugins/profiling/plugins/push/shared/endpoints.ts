import { z } from "zod";
import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";

const PushEntrySchema = z.object({
  pushId: z.string(),
  branch: z.string(),
  outcome: z.string(),
  startedAt: z.string(),
  startMs: z.number(),
  waitMs: z.number(),
  holdMs: z.number(),
  conversationId: z.string().nullable(),
  interrupted: z.boolean(),
});

const BuildEntrySchema = z.object({
  worktree: z.string(),
  buildId: z.string().nullable(),
  startMs: z.number(),
  durationMs: z.number(),
  success: z.boolean(),
  interrupted: z.boolean(),
});

const WorktreeGroupSchema = z.object({
  worktree: z.string(),
  pushes: z.array(PushEntrySchema),
  builds: z.array(BuildEntrySchema),
});

export const getPushProfiling = defineEndpoint({
  route: "GET /api/debug/profiling/push",
  query: z.object({
    since: z.coerce.number().optional(),
    worktree: z.string().optional(),
    padding: z.coerce.number().optional(),
  }),
  response: z.object({
    groups: z.array(WorktreeGroupSchema),
    totalMs: z.number(),
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
