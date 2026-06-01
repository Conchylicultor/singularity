import { useCallback } from "react";
import { useConfig, useSetConfig } from "@plugins/config_v2/web";
import {
  MODEL_REGISTRY,
  normalizeModel,
  type ConversationModel,
} from "../../core";
import { modelProviderConfig } from "../../shared/config";

const ALL_MODELS = Object.keys(MODEL_REGISTRY) as ConversationModel[];

/** Models to show in the launch dropdown, in registry order, filtered by config. */
export function useVisibleModels(): ConversationModel[] {
  const { visibleModels } = useConfig(modelProviderConfig);
  const visible = ALL_MODELS.filter((id) => visibleModels[id] !== false);
  // Never present an empty dropdown — fall back to all models if config hides everything.
  return visible.length > 0 ? visible : ALL_MODELS;
}

/** The user-chosen default model fired by the main launch button. */
export function useDefaultModel(): ConversationModel {
  const { defaultModel } = useConfig(modelProviderConfig);
  return normalizeModel(defaultModel);
}

/** Persist a new default model. */
export function useSetDefaultModel(): (model: ConversationModel) => void {
  const setConfig = useSetConfig(modelProviderConfig);
  return useCallback(
    (model: ConversationModel) => setConfig("defaultModel", model),
    [setConfig],
  );
}
