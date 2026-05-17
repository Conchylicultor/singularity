import { z } from "zod";

export const TaskChainTargetSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("metaTask"), metaTaskId: z.string().min(1) }),
  z.object({ kind: z.literal("child"), parentTaskId: z.string().min(1) }),
]);
export type TaskChainTarget = z.infer<typeof TaskChainTargetSchema>;

export const TaskChainRelateModeSchema = z.enum(["prerequisite", "followup"]);
export type TaskChainRelateMode = z.infer<typeof TaskChainRelateModeSchema>;

export const TaskChainRelateSchema = z.object({
  taskId: z.string().min(1),
  mode: TaskChainRelateModeSchema,
  insertBefore: z.array(z.string().min(1)).optional(),
  standalone: z.boolean().optional(),
});
export type TaskChainRelate = z.infer<typeof TaskChainRelateSchema>;

export const TaskChainLaunchSchema = z.enum(["sonnet", "opus"]).nullable();
export type TaskChainLaunch = z.infer<typeof TaskChainLaunchSchema>;

export const TaskChainCardSchema = z.object({
  text: z.string().min(1),
  launch: TaskChainLaunchSchema,
  url: z.string().optional(),
  attachmentIds: z.array(z.string()).optional(),
  // Honored on head card only when target.kind === "child".
  includeParentTask: z.boolean().optional(),
  // When false, this card does not block on the previous card (parallel launch).
  // Omitted means true (sequential, default). Ignored on the head card.
  linkedToPrev: z.boolean().optional(),
});
export type TaskChainCard = z.infer<typeof TaskChainCardSchema>;

export const TaskChainSubmitBodySchema = z.object({
  target: TaskChainTargetSchema,
  // Only the head card honors `relate`.
  relate: TaskChainRelateSchema.optional(),
  cards: z.array(TaskChainCardSchema).min(1),
});
export type TaskChainSubmitBody = z.infer<typeof TaskChainSubmitBodySchema>;

export const TaskChainSubmitResponseSchema = z.object({
  taskIds: z.array(z.string()),
});
export type TaskChainSubmitResponse = z.infer<typeof TaskChainSubmitResponseSchema>;
