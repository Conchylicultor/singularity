import { z } from "zod";
import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";

/**
 * How to answer the terminal menu a conversation waits on. An option is named
 * by number AND label: the server refuses when the menu on screen no longer
 * offers that label at that number, so a stale card can never pick something
 * the user did not see.
 */
export const AnswerMenuBodySchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("option"),
    n: z.number().int().positive(),
    label: z.string(),
  }),
  z.object({ kind: z.literal("cancel") }),
]);
export type AnswerMenuBody = z.infer<typeof AnswerMenuBodySchema>;

/** Answer (or cancel) the menu open in the conversation's terminal. */
export const answerTerminalMenu = defineEndpoint({
  route: "POST /api/conversations/:id/menu/answer",
  body: AnswerMenuBodySchema,
});
