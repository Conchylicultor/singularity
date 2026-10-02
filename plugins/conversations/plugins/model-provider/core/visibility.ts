import { choiceHint, selectableChoices, type ModelCatalog } from "./catalog";
import {
  SELECTABLE_FAMILIES,
  choiceLabel,
  isModelFamily,
  type ModelChoice,
} from "./registry";

/**
 * The saved `visibleModels` setting: choice → shown in the launch dropdown.
 * A free-key record, not a fixed object, so it never enumerates the models a
 * release adds: an ABSENT key means the default ({@link isShownByDefault}),
 * and a key for a version this machine does not offer (retired, or from a
 * newer checkout) is simply never read.
 */
export type VisibleModelsSetting = Readonly<Record<string, boolean>>;

/**
 * Families are on by default; a pinned version is off until the user turns
 * it on — pinning is a deliberate choice, never the default.
 */
export function isShownByDefault(choice: ModelChoice): boolean {
  return isModelFamily(choice);
}

/** Whether one choice shows in the launch dropdown under this setting. */
export function isChoiceVisible(
  setting: VisibleModelsSetting,
  choice: ModelChoice,
): boolean {
  return setting[choice] ?? isShownByDefault(choice);
}

/**
 * The choices every model picker shows: the catalog's selectable choices the
 * setting leaves on, in picker order. Never empty — when the setting hides
 * everything, the families come back, so a dropdown can always launch.
 */
export function visibleChoices(
  catalog: ModelCatalog,
  setting: VisibleModelsSetting,
): ModelChoice[] {
  const visible = selectableChoices(catalog).filter((choice) =>
    isChoiceVisible(setting, choice),
  );
  return visible.length > 0 ? visible : [...SELECTABLE_FAMILIES];
}

/**
 * One choice as a settings option: "Opus · 5.5" for a family (the version it
 * runs today, from the catalog), "Opus 5" for a pinned version.
 */
export function choiceOptionLabel(
  choice: ModelChoice,
  catalog: ModelCatalog,
): string {
  const hint = choiceHint(choice, catalog);
  return hint ? `${choiceLabel(choice)} · ${hint}` : choiceLabel(choice);
}
