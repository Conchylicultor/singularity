import { type ReactNode } from "react";
import { ControlPanel } from "@plugins/primitives/plugins/css/plugins/control-panel/web";
import { useGroupByController } from "../../internal/use-group-by-controller";
import { useDataViewControls } from "../controls/controls-context";

/**
 * Group-by setting (the first `view`-scope settings contribution): a field
 * picker writing `viewModel.setGroupBy`, reading groupable fields + the active
 * groupBy from `DataViewControlsContext`. Renders nothing when the active view
 * opts out of group-by (`supportsGroupBy: false`) or the schema has no
 * groupable field — so the panel stays empty-clean.
 *
 * Picking one field of several is single-select, so the rows say so in the one
 * language the vocabulary has for it: `select="radio"`, which paints a checkmark
 * and NO background fill. The old row drew its own leading
 * `<MdCheck className={selected ? undefined : "invisible"}/>` beside a
 * `selected` full-row highlight — a hand-made rail plus a second meaning for
 * "filled row", which already means hover.
 */
export function GroupByControl(): ReactNode {
  const {
    fields,
    activeState,
    activeViewId,
    viewModel,
    activeSupportsGroupBy,
  } = useDataViewControls();

  const controller = useGroupByController(
    fields,
    activeState.groupBy ?? null,
    (fieldId) => viewModel.setGroupBy(activeViewId, fieldId),
  );

  if (!activeSupportsGroupBy || controller.groupableFields.length === 0) {
    return null;
  }

  // "None" is one of the options, not a reset button beside them: ungrouped is a
  // grouping choice, so it sits in the same radio set as the fields.
  const options: { id: string | null; label: string }[] = [
    { id: null, label: "None" },
    ...controller.groupableFields.map((f) => ({ id: f.id, label: f.label })),
  ];

  return (
    <ControlPanel.Section label="Group by">
      {options.map((option) => (
        <ControlPanel.Row
          key={option.id ?? "__none__"}
          select="radio"
          checked={controller.groupBy === option.id}
          onSelect={() => controller.setGroupBy(option.id)}
        >
          {option.label}
        </ControlPanel.Row>
      ))}
    </ControlPanel.Section>
  );
}
