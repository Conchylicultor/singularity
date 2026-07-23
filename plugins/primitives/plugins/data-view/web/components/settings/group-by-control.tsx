import { type ReactNode } from "react";
import { MdCheck } from "react-icons/md";
import { Row } from "@plugins/primitives/plugins/css/plugins/row/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { SectionLabel } from "@plugins/primitives/plugins/css/plugins/text/web";
import { useGroupByController } from "../../internal/use-group-by-controller";
import { useDataViewSettings } from "./settings-context";

/**
 * Group-by setting (the first `view`-scope settings contribution): a field
 * picker writing `viewModel.setGroupBy`, reading groupable fields + the active
 * groupBy from `DataViewSettingsContext`. Renders nothing when the active view
 * opts out of group-by (`supportsGroupBy: false`) or the schema has no
 * groupable field — so the "Current view" section stays empty-clean.
 */
export function GroupByControl(): ReactNode {
  const { fields, activeState, activeViewId, viewModel, activeSupportsGroupBy } =
    useDataViewSettings();

  const controller = useGroupByController(
    fields,
    activeState.groupBy ?? null,
    (fieldId) => viewModel.setGroupBy(activeViewId, fieldId),
  );

  if (!activeSupportsGroupBy || controller.groupableFields.length === 0) {
    return null;
  }

  const renderOption = (fieldId: string | null, label: string): ReactNode => {
    const selected = controller.groupBy === fieldId;
    return (
      <Row
        key={fieldId ?? "__none__"}
        size="sm"
        selected={selected}
        onClick={() => controller.setGroupBy(fieldId)}
        icon={<MdCheck className={selected ? undefined : "invisible"} />}
      >
        {label}
      </Row>
    );
  };

  return (
    <Stack gap="2xs">
      <SectionLabel>Group by</SectionLabel>
      {renderOption(null, "None")}
      {controller.groupableFields.map((f) => renderOption(f.id, f.label))}
    </Stack>
  );
}
