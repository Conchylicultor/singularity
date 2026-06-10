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
  // The conversation that drove this worktree's work — the first event's
  // conversationId — and its human title, resolved from the main DB. Null when
  // no event carried a conversationId (e.g. build-only rows) or the title is
  // unset. The bar label falls back to the bare worktree id when title is null.
  conversationId: z.string().nullable(),
  title: z.string().nullable(),
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

export const PushStepSchema = z.object({
  name: z.string(),
  startMs: z.number(),
  durationMs: z.number(),
});
export type PushStep = z.infer<typeof PushStepSchema>;

export const PushDetailSchema = z.object({
  pushId: z.string(),
  branch: z.string(),
  outcome: z.string(),
  mode: z.enum(["worktree", "from-main"]),
  conversationId: z.string().nullable(),
  startedAt: z.string(),
  lockRequestedAt: z.string(),
  lockAcquiredAt: z.string(),
  completedAt: z.string().nullable(),
  preLockMs: z.number(),
  waitMs: z.number(),
  holdMs: z.number(),
  totalMs: z.number(),
  interrupted: z.boolean(),
  steps: z.array(PushStepSchema),
});
export type PushDetail = z.infer<typeof PushDetailSchema>;

export const getPushDetail = defineEndpoint({
  route: "GET /api/debug/profiling/push/:pushId",
  response: PushDetailSchema,
});
