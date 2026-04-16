import { z } from "zod";

export const ConversationModelSchema = z.enum(["opus", "sonnet"]);
export type ConversationModel = z.infer<typeof ConversationModelSchema>;
