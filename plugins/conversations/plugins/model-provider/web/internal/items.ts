import { MODEL_REGISTRY, type ConversationModel } from "../../core";
import { useVisibleModels } from "./hooks";

/** One selectable model, as a menu/list row. */
export interface ModelItem {
  value: ConversationModel;
  label: string;
}

/**
 * The visible models as rows, in registry order — the one reader every surface
 * that draws a model list shares (the launch popover, the composer's run pill),
 * so none of them re-derives "which models, under which labels" from the
 * registry itself.
 */
export function useModelItems(): ModelItem[] {
  return useVisibleModels().map((value) => ({
    value,
    label: MODEL_REGISTRY[value].label,
  }));
}
