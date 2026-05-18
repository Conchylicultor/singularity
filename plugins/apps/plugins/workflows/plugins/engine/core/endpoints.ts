import { z } from "zod";
import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";

export const CreateDefinitionBodySchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  steps: z.record(z.unknown()).optional(),
  entryStepId: z.string().optional(),
});
export type CreateDefinitionBody = z.infer<typeof CreateDefinitionBodySchema>;

export const UpdateDefinitionBodySchema = z.object({
  name: z.string().optional(),
  description: z.string().nullable().optional(),
  steps: z.record(z.unknown()).optional(),
  entryStepId: z.string().nullable().optional(),
});
export type UpdateDefinitionBody = z.infer<typeof UpdateDefinitionBodySchema>;

export const CreateExecutionBodySchema = z.object({
  definitionId: z.string(),
});
export type CreateExecutionBody = z.infer<typeof CreateExecutionBodySchema>;

export const SubmitStepBodySchema = z.object({
  data: z.record(z.unknown()).optional(),
});
export type SubmitStepBody = z.infer<typeof SubmitStepBodySchema>;

export const listDefinitions = defineEndpoint({
  route: "GET /api/workflows/definitions",
});

export const createDefinition = defineEndpoint({
  route: "POST /api/workflows/definitions",
  body: CreateDefinitionBodySchema,
});

export const getDefinition = defineEndpoint({
  route: "GET /api/workflows/definitions/:id",
});

export const updateDefinition = defineEndpoint({
  route: "PATCH /api/workflows/definitions/:id",
  body: UpdateDefinitionBodySchema,
});

export const deleteDefinition = defineEndpoint({
  route: "DELETE /api/workflows/definitions/:id",
});

export const listExecutions = defineEndpoint({
  route: "GET /api/workflows/executions",
});

export const createExecution = defineEndpoint({
  route: "POST /api/workflows/executions",
  body: CreateExecutionBodySchema,
});

export const getExecution = defineEndpoint({
  route: "GET /api/workflows/executions/:id",
});

export const deleteExecution = defineEndpoint({
  route: "DELETE /api/workflows/executions/:id",
});

export const submitStep = defineEndpoint({
  route: "POST /api/workflows/executions/:execId/steps/:stepId/submit",
  body: SubmitStepBodySchema,
});
