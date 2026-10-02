import { useCallback } from "react";
import { useConfig, useSetConfig } from "@plugins/config_v2/web";
import {
  SELECTABLE_FAMILIES,
  isChoiceVisible,
  normalizeModelChoice,
  visibleChoices,
  type ModelChoice,
} from "../../core";
import { modelProviderConfig } from "../../shared/config";
import { useModelCatalog } from "./catalog";

/**
 * Choices to show in every model picker — families first, then the pinned
 * versions the user turned on, from the live catalog. The families are code
 * and always offerable; the pinned versions join once the catalog is settled
 * (it is preloaded, so that is the first render).
 */
export function useVisibleModels(): ModelChoice[] {
  const { visibleModels } = useConfig(modelProviderConfig);
  const catalog = useModelCatalog();
  if (catalog.status === "ready")
    return visibleChoices(catalog.data, visibleModels);
  const families = SELECTABLE_FAMILIES.filter((family) =>
    isChoiceVisible(visibleModels, family),
  );
  // Never present an empty dropdown (the same rule `visibleChoices` applies).
  return families.length > 0 ? families : [...SELECTABLE_FAMILIES];
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
