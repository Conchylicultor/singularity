import { z } from "zod";
import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";

export const listLaunchPrompts = defineEndpoint({
  route: "GET /api/launch-prompts",
});

const LaunchPromptBodySchema = z.object({
  title: z.string(),
  prompt: z.string(),
  model: z.string().optional(),
});

export const createLaunchPrompt = defineEndpoint({
  route: "POST /api/launch-prompts",
  body: LaunchPromptBodySchema,
});

const UpdateLaunchPromptBodySchema = z.object({
  title: z.string().optional(),
  prompt: z.string().optional(),
  model: z.string().optional(),
});

export const updateLaunchPrompt = defineEndpoint({
  route: "PATCH /api/launch-prompts/:id",
  body: UpdateLaunchPromptBodySchema,
});

export const deleteLaunchPrompt = defineEndpoint({
  route: "DELETE /api/launch-prompts/:id",
});
