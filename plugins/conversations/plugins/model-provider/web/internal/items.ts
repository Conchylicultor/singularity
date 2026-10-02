import {
  choiceHint,
  choiceLabel,
  type ModelCatalog,
  type ModelChoice,
} from "../../core";
import { useModelCatalog } from "./catalog";
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
 * labels" from the registry itself. The hint is the live catalog's: absent
 * only until the (preloaded) catalog has settled.
 */
export function useModelItems(): ModelItem[] {
  const catalog = useModelCatalog();
  const settled = catalog.status === "ready" ? catalog.data : undefined;
  return useVisibleModels().map((value) => modelItem(value, settled));
}

function modelItem(
  value: ModelChoice,
  catalog: ModelCatalog | undefined,
): ModelItem {
  const hint = catalog ? choiceHint(value, catalog) : undefined;
  return { value, label: choiceLabel(value), ...(hint ? { hint } : {}) };
}
