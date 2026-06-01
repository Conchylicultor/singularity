import { MODEL_REGISTRY, normalizeModel, type ConversationModel } from "../../core";

export function resolveCliFlag(model: ConversationModel): string {
  return MODEL_REGISTRY[normalizeModel(model)].cliFlag;
}
