import { useCallback } from "react";
import { useConfig, useSetConfig } from "@plugins/config_v2/web";
import {
  SELECTABLE_MODELS,
  normalizeModel,
  type ConversationModel,
} from "../../core";
import { modelProviderConfig } from "../../shared/config";

/** Models to show in the launch dropdown, in registry order, filtered by config. */
export function useVisibleModels(): ConversationModel[] {
  const { visibleModels } = useConfig(modelProviderConfig);
  const visible = SELECTABLE_MODELS.filter((id) => visibleModels[id] !== false);
  // Never present an empty dropdown — fall back to all selectable models if config hides everything.
  return visible.length > 0 ? visible : SELECTABLE_MODELS;
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
