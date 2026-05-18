import { z } from "zod";
import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";

export const listPromptTemplates = defineEndpoint({
  route: "GET /api/prompt-templates",
});

const CreatePromptTemplateBodySchema = z.object({
  title: z.string(),
  prompt: z.string(),
});

export const createPromptTemplate = defineEndpoint({
  route: "POST /api/prompt-templates",
  body: CreatePromptTemplateBodySchema,
});

const UpdatePromptTemplateBodySchema = z.object({
  title: z.string().optional(),
  prompt: z.string().optional(),
});

export const updatePromptTemplate = defineEndpoint({
  route: "PATCH /api/prompt-templates/:id",
  body: UpdatePromptTemplateBodySchema,
});

export const deletePromptTemplate = defineEndpoint({
  route: "DELETE /api/prompt-templates/:id",
});

export const usePromptTemplate = defineEndpoint({
  route: "POST /api/prompt-templates/:id/use",
});
