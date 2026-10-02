import type { DynamicEnumOption } from "@plugins/fields/plugins/dynamic-enum/plugins/config/web";
import type { DynamicFlagOption } from "@plugins/fields/plugins/dynamic-flags/plugins/config/web";
import {
  SELECTABLE_FAMILIES,
  choiceLabel,
  choiceOptionLabel,
  isShownByDefault,
  selectableChoices,
  type ModelChoice,
} from "../../core";
import { useModelCatalog } from "./catalog";

/**
 * Every session-selectable choice with its settings label ("Opus · 5.5",
 * "Opus 5"), from the LIVE catalog — what a config field over model choices
 * offers. Until the (preloaded) catalog has settled, the families alone, which
 * are code and always offerable, without a version hint.
 */
function useChoiceLabels(): { value: ModelChoice; label: string }[] {
  const catalog = useModelCatalog();
  if (catalog.status !== "ready")
    return SELECTABLE_FAMILIES.map((value) => ({
      value,
      label: choiceLabel(value),
    }));
  return selectableChoices(catalog.data).map((value) => ({
    value,
    label: choiceOptionLabel(value, catalog.data),
  }));
}

/** Options of a single-choice model setting (a `dynamicEnumField`). */
export function useModelChoiceOptions(): readonly DynamicEnumOption[] {
  return useChoiceLabels();
}

/** Options of the `visibleModels` toggles, each with its default (families on, versions off). */
export function useVisibleModelFlagOptions(): readonly DynamicFlagOption[] {
  return useChoiceLabels().map((option) => ({
    ...option,
    defaultOn: isShownByDefault(option.value),
  }));
}
