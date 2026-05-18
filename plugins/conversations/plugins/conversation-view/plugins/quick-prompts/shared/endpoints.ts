import { z } from "zod";
import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";

export const listQuickPrompts = defineEndpoint({
  route: "GET /api/quick-prompts",
});

const CreateQuickPromptBodySchema = z.object({
  title: z.string(),
  prompt: z.string(),
});

export const createQuickPrompt = defineEndpoint({
  route: "POST /api/quick-prompts",
  body: CreateQuickPromptBodySchema,
});

const UpdateQuickPromptBodySchema = z.object({
  title: z.string().optional(),
  prompt: z.string().optional(),
});

export const updateQuickPrompt = defineEndpoint({
  route: "PATCH /api/quick-prompts/:id",
  body: UpdateQuickPromptBodySchema,
});

export const deleteQuickPrompt = defineEndpoint({
  route: "DELETE /api/quick-prompts/:id",
});
