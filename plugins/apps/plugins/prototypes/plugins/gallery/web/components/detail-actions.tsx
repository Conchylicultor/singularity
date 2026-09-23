import { SegmentedControl } from "@plugins/primitives/plugins/css/plugins/toggle-chip/web";
import { usePrototypeDetail } from "../context";

/**
 * The detail pane's header controls, each a zero-prop contribution to
 * `prototypeDetailPane.Actions` — the standard pane extension point, so any
 * plugin can add a control beside these without this file changing (the
 * Present menu is one such contribution, from a sibling plugin).
 */

/**
 * The stage picker — one chip per contributed stage, in the order the stages
 * declare. It names no stage: the options ARE the contributions, so a plugin
 * adding a stage adds a chip here without this file changing.
 */
export function StageSwitcher() {
  const { stages, stage, setStage } = usePrototypeDetail();
  if (stages.length < 2) return null;
  return (
    <SegmentedControl<string>
      options={stages.map((s) => ({ id: s.id, label: s.label }))}
      value={stage?.id ?? ""}
      onChange={setStage}
    />
  );
}
