import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";
import { z } from "zod";

export const AnswerAskUserQuestionBodySchema = z.object({ text: z.string().min(1) });

export const answerAskUserQuestion = defineEndpoint({
  route: "POST /api/conversations/:id/answer-question",
  body: AnswerAskUserQuestionBodySchema,
});
