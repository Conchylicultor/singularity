import { z } from "zod";

export const DefinitionStepSchema = z.object({
  id: z.string(),
  pluginId: z.string(),
  label: z.string(),
  // No zod `.default()` here: this schema is the resource/wire contract, and the
  // server always serializes complete step objects. Keeping input === output
  // (every field required, `next`/`nextStepMapping` nullable) means the
  // live-state resource's data type matches `z.infer` exactly, so consumers can
  // assign a resource row straight to `WorkflowDefinition`.
  config: z.record(z.unknown()),
  next: z.string().nullable(),
  nextStepMapping: z.record(z.string()).nullable(),
});
export type DefinitionStep = z.infer<typeof DefinitionStepSchema>;

export const WorkflowDefinitionSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  steps: z.record(z.string(), DefinitionStepSchema),
  entryStepId: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type WorkflowDefinition = z.infer<typeof WorkflowDefinitionSchema>;

export const ExecutionStatusSchema = z.enum([
  "pending",
  "running",
  "suspended",
  "completed",
  "failed",
  "cancelled",
  "expired",
]);
export type ExecutionStatus = z.infer<typeof ExecutionStatusSchema>;

export const ExecutionStepStatusSchema = z.enum([
  "pending",
  "running",
  "suspended",
  "completed",
  "failed",
  "skipped",
  "cancelled",
  "expired",
]);
export type ExecutionStepStatus = z.infer<typeof ExecutionStepStatusSchema>;

export const WorkflowExecutionStepSchema = z.object({
  id: z.string(),
  executionId: z.string(),
  definitionStepId: z.string(),
  executionOrder: z.number(),
  stepPluginId: z.string(),
  label: z.string(),
  config: z.record(z.unknown()),
  nextStepMapping: z.record(z.string()).nullable(),
  status: ExecutionStepStatusSchema,
  input: z.unknown().nullable(),
  output: z.unknown().nullable(),
  error: z.string().nullable(),
  startedAt: z.string().nullable(),
  completedAt: z.string().nullable(),
  expiresAt: z.string().nullable(),
});
export type WorkflowExecutionStep = z.infer<typeof WorkflowExecutionStepSchema>;

export const WorkflowExecutionSchema = z.object({
  id: z.string(),
  definitionId: z.string(),
  status: ExecutionStatusSchema,
  currentStepId: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  completedAt: z.string().nullable(),
  steps: z.array(WorkflowExecutionStepSchema),
});
export type WorkflowExecution = z.infer<typeof WorkflowExecutionSchema>;
