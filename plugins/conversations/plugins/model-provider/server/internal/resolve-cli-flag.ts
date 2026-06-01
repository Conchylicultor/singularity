import { getConfig } from "@plugins/config_v2/server";
import { MODEL_REGISTRY, type ConversationModel } from "../../core";
import { modelProviderConfig } from "../../shared/config";

const OPUS_CLI_FLAGS: Record<string, string> = {
  "4-6": "claude-opus-4-6",
  "4-7": "claude-opus-4-7",
  "4-8": "claude-opus-4-8",
};

export function resolveCliFlag(model: ConversationModel): string {
  if (model === "opus") {
    const { opusVersion } = getConfig(modelProviderConfig);
    return OPUS_CLI_FLAGS[opusVersion]!;
  }
  return MODEL_REGISTRY[model].cliFlag;
}
