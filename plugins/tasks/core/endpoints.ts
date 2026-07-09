import { z } from "zod";
import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";
import { RankSchema } from "@plugins/primitives/plugins/rank/core";
import { ConversationModelSchema } from "@plugins/conversations/plugins/model-provider/core";
import { dateString } from "@plugins/infra/plugins/endpoints/core";
import {
  TaskChainSubmitBodySchema,
  TaskChainSubmitResponseSchema,
} from "./task-chain-types";

// --- Body schemas ---

export const CreateTaskBodySchema = z.object({
  folderId: z.string().nullable().optional(),
  title: z.string().optional(),
  description: z.string().nullable().optional(),
  author: z.string().optional(),
  rank: z.string().optional(),
  // Positional intent: place the new task immediately after this sibling.
  // Resolved server-side against the complete sibling set (see rankAfterSibling)
  // and takes precedence over `rank` / plain append.
  afterId: z.string().optional(),
  dependencies: z.array(z.string()).optional(),
  autoStart: z
    .object({
      model: ConversationModelSchema.optional(),
    })
    .optional(),
  attachmentIds: z.array(z.string()).optional(),
});
export type CreateTaskBody = z.infer<typeof CreateTaskBodySchema>;

export const UpdateTaskBodySchema = z.object({
  title: z.string().optional(),
  description: z.string().nullable().optional(),
  drop: z.boolean().optional(),
  hold: z.boolean().optional(),
  expanded: z.boolean().optional(),
  folderId: z.string().nullable().optional(),
  rank: RankSchema.optional(),
});
export type UpdateTaskBody = z.infer<typeof UpdateTaskBodySchema>;

export const InsertBetweenBodySchema = z.object({
  sourceTaskId: z.string(),
  targetTaskId: z.string(),
  targetFolderId: z.string().nullable().optional(),
});
export type InsertBetweenBody = z.infer<typeof InsertBetweenBodySchema>;

export const SetAutoStartBodySchema = z.object({
  model: ConversationModelSchema,
});
export type SetAutoStartBody = z.infer<typeof SetAutoStartBodySchema>;

export const AddDependencyBodySchema = z.object({
  dependsOnTaskId: z.string().min(1),
});
export type AddDependencyBody = z.infer<typeof AddDependencyBodySchema>;

// Wire-format response schema: plain JSON types (no Rank class, no Date class).
// Consumers that need the rich domain types should parse via TaskSchema locally.
export const TaskResponseSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  status: z.string(),
  folderId: z.string().nullable(),
  groupId: z.string().nullable(),
  rank: z.string(),
  expanded: z.boolean(),
  active: z.boolean(),
  author: z.string().nullable(),
  createdAt: dateString(),
  updatedAt: dateString(),
  droppedAt: dateString().nullable(),
  heldAt: dateString().nullable(),
  finishedAt: dateString().nullable(),
  dependencies: z.array(z.string()),
});

// --- Endpoint definitions ---

export const listTasks = defineEndpoint({
  route: "GET /api/tasks",
  response: z.array(TaskResponseSchema),
});

export const createTask = defineEndpoint({
  route: "POST /api/tasks",
  body: CreateTaskBodySchema,
  response: TaskResponseSchema,
});

export const createTaskChain = defineEndpoint({
  route: "POST /api/tasks/chain",
  body: TaskChainSubmitBodySchema,
  response: TaskChainSubmitResponseSchema,
});

export const insertTaskBetween = defineEndpoint({
  route: "POST /api/tasks/insert-between",
  body: InsertBetweenBodySchema,
  response: TaskResponseSchema,
});

export const getTask = defineEndpoint({
  route: "GET /api/tasks/:id",
  response: TaskResponseSchema,
});

export const updateTask = defineEndpoint({
  route: "PATCH /api/tasks/:id",
  body: UpdateTaskBodySchema,
  response: TaskResponseSchema,
});

export const setTaskAutoStart = defineEndpoint({
  route: "POST /api/tasks/:id/auto-start",
  body: SetAutoStartBodySchema,
});

export const clearTaskAutoStart = defineEndpoint({
  route: "DELETE /api/tasks/:id/auto-start",
});

export const addTaskDependency = defineEndpoint({
  route: "POST /api/tasks/:id/dependencies",
  body: AddDependencyBodySchema,
});

export const removeTaskDependency = defineEndpoint({
  route: "DELETE /api/tasks/:id/dependencies/:depId",
});

export const RepoInfoResponseSchema = z.object({
  githubBase: z.string().nullable(),
});

export const getRepoInfo = defineEndpoint({
  route: "GET /api/repo-info",
  response: RepoInfoResponseSchema,
});
