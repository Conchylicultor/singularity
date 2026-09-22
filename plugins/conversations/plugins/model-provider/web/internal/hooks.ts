import { useCallback } from "react";
import { useConfig, useSetConfig } from "@plugins/config_v2/web";
import {
  SELECTABLE_CHOICES,
  isModelFamily,
  normalizeModelChoice,
  type ModelChoice,
} from "../../core";
import { modelProviderConfig } from "../../shared/config";

/** Choices to show in every model picker — families first, then the pinned versions the user turned on. */
export function useVisibleModels(): ModelChoice[] {
  const { visibleModels } = useConfig(modelProviderConfig);
  const visible = SELECTABLE_CHOICES.filter(
    (choice) => visibleModels[choice] ?? isModelFamily(choice),
  );
  // Never present an empty dropdown — fall back to the families if config hides everything.
  return visible.length > 0
    ? visible
    : SELECTABLE_CHOICES.filter((choice) => isModelFamily(choice));
}

/** The user-chosen default model fired by the main launch button. */
export function useDefaultModel(): ModelChoice {
  const { defaultModel } = useConfig(modelProviderConfig);
  return normalizeModelChoice(defaultModel);
}

/** Persist a new default model. */
export function useSetDefaultModel(): (model: ModelChoice) => void {
  const setConfig = useSetConfig(modelProviderConfig);
  return useCallback(
    (model: ModelChoice) => setConfig("defaultModel", model),
    [setConfig],
  );
}
