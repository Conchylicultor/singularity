import { z } from "zod";

export const ConversationModelSchema = z.enum(["opus", "sonnet"]);
export type ConversationModel = z.infer<typeof ConversationModelSchema>;

export const DEFAULT_MODEL: ConversationModel = "opus";

export type ModelMeta = {
  cliFlag: string;
  label: string;
  iconSize: string;
};

export const MODEL_REGISTRY: Record<ConversationModel, ModelMeta> = {
  opus:   { cliFlag: "claude-opus-4-6",   label: "Opus",   iconSize: "size-4" },
  sonnet: { cliFlag: "claude-sonnet-4-6", label: "Sonnet", iconSize: "size-3" },
};
