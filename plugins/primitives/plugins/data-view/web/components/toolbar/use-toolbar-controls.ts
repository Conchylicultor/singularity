import { DataViewSlots, type DataViewControl } from "../../slots";
import { useDataViewControls } from "../controls/controls-context";

/**
 * The toolbar's control list and badge count, derived ONE way for every place
 * the controls are reached — the band (wide and compact) and a hosted
 * surface's options trigger — so they cannot disagree about which controls
 * apply or what the badge says.
 *
 * Reads `DataViewSlots.Control`, drops the ones that do not apply to the active
 * view + schema, and orders them. `isApplicable` is pure and asked BEFORE
 * anything mounts — a control that does not apply costs nothing, not even a
 * mounted-then-null component.
 *
 * `activeCount` is what the open panels would tell you, added up. Each
 * control's own `summary` answers for itself (`count` defaults to the whole
 * thing it describes), so a new control counts into the badge with no edit
 * here. It does NOT include the search query — callers that fold search into
 * the same trigger add it.
 */
export function useToolbarControls(): {
  controls: DataViewControl[];
  activeCount: number;
} {
  const ctx = useDataViewControls();
  const controls = DataViewSlots.Control.useContributions()
    .filter((c) => c.isApplicable?.(ctx) ?? true)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const activeCount = controls.reduce((sum, c) => {
    const s = c.summary?.(ctx) ?? null;
    return sum + (s ? (s.count ?? 1 + (s.more ?? 0)) : 0);
  }, 0);
  return { controls, activeCount };
}
