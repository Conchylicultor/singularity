import { choiceHint, choiceLabel, type ModelChoice } from "../../core";
import { useVisibleModels } from "./hooks";

/** One selectable model choice, as a menu/list row. */
export interface ModelItem {
  value: ModelChoice;
  /** "Opus" for a family, "Opus 5" for a pinned version. */
  label: string;
  /** The version a family runs today ("5.5"), rendered muted beside the label. */
  hint?: string;
}

/**
 * The visible choices as rows, in picker order — the one reader every surface
 * that draws a model list shares (the launch popover, the composer's run pill,
 * the model select), so none of them re-derives "which models, under which
 * labels" from the registry itself.
 */
export function useModelItems(): ModelItem[] {
  return useVisibleModels().map(modelItem);
}

export function modelItem(value: ModelChoice): ModelItem {
  return { value, label: choiceLabel(value), hint: choiceHint(value) };
}
