import { MODEL_REGISTRY, type ConversationModel } from "../../core";

export function resolveCliFlag(model: ConversationModel): string {
  return MODEL_REGISTRY[model].cliFlag;
}
