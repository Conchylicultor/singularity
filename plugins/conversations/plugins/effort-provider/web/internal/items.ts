import {
  EFFORT_REGISTRY,
  SELECTABLE_EFFORTS,
  type EffortLevel,
} from "../../core";

/** One selectable thinking mode, as a menu/list row. */
export interface EffortItem {
  value: EffortLevel;
  label: string;
}

/**
 * Every selectable thinking mode as rows, in registry order — the one reader
 * shared by the surfaces that draw an effort list, so none of them re-derives
 * "which levels, under which labels" from the registry itself.
 *
 * A plain function, not a hook: the effort set is a frozen registry with no
 * config behind it, unlike the visible-model set.
 */
export function effortItems(): EffortItem[] {
  return SELECTABLE_EFFORTS.map((value) => ({
    value,
    label: EFFORT_REGISTRY[value].label,
  }));
}
