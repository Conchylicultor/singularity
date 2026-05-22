import { z } from "zod";
import { defineJob } from "@plugins/infra/plugins/jobs/server";
import { scheduleTaskTitleUpgrade } from "./generate-title";

export const titleOnConversationCreatedJob = defineJob({
  name: "task-title.on-conversation-created",
  input: z.object({}).passthrough(),
  dedup: "none",
  event: z.object({
    taskId: z.string(),
    prompt: z.string().optional(),
    kind: z.string().optional(),
  }).passthrough(),
  maxAttempts: 2,
  run: async ({ event }) => {
    if (!event?.prompt || event.kind === "system") return;
    scheduleTaskTitleUpgrade(event.taskId, event.prompt);
  },
});

export const titleOnUserTurnSentJob = defineJob({
  name: "task-title.on-user-turn-sent",
  input: z.object({}).passthrough(),
  dedup: "none",
  event: z.object({
    taskId: z.string(),
    text: z.string(),
  }).passthrough(),
  maxAttempts: 2,
  run: async ({ event }) => {
    if (!event?.text) return;
    scheduleTaskTitleUpgrade(event.taskId, event.text);
  },
});
