import { useCallback, type ReactNode } from "react";
import { MdDragIndicator, MdVisibility } from "react-icons/md";
import { Button, cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Fill } from "@plugins/primitives/plugins/css/plugins/fill/web";
import { Row } from "@plugins/primitives/plugins/css/plugins/row/web";
import {
  SectionLabel,
  Text,
} from "@plugins/primitives/plugins/css/plugins/text/web";
import { CheckboxIndicator } from "@plugins/primitives/plugins/css/plugins/selection-indicator/web";
import {
  SortableItem,
  SortableList,
} from "@plugins/primitives/plugins/sortable-list/web";
import { useVisibleFieldsController } from "../../internal/use-visible-fields-controller";
import { useDataViewSettings } from "./settings-context";

/**
 * One Properties row: `[drag handle] [✓ field label]`. The whole label region is
 * the visibility toggle (a `Row`), and the leading handle reorders the field —
 * mirroring `SortRuleRow`'s handle + `data-view-settings-button`'s Row body. The
 * row is a `SortableItem` keyed by `field.id`; list order = body order.
 */
function PropertyRow(props: {
  id: string;
  label: string;
  visible: boolean;
  onToggle: (id: string) => void;
}): ReactNode {
  const { id, label, visible, onToggle } = props;
  return (
    <SortableItem
      id={id}
      handle
      className={({ isDragging }) => cn(isDragging && "opacity-40")}
    >
      {(state) => (
        <Stack direction="row" align="center" gap="xs">
          <span
            {...state.handleProps}
            className="cursor-grab text-muted-foreground hover:text-foreground active:cursor-grabbing"
          >
            <MdDragIndicator className="size-4" />
          </span>
          <Fill>
            <Row
              onClick={() => onToggle(id)}
              icon={<CheckboxIndicator checked={visible} />}
            >
              <Text variant="body" className="truncate">
                {label}
              </Text>
            </Row>
          </Fill>
        </Stack>
      )}
    </SortableItem>
  );
}

/**
 * Properties setting (a `view`-scope settings contribution): a per-view-instance
 * control governing which fields render in the view body and in what order
 * (Notion "Properties"). A reorderable, toggleable field list driven by the
 * `VisibleFieldsController`, plus a "Show all fields" reset. Reads the field
 * schema + active-instance state from `DataViewSettingsContext` and writes back
 * through `viewModel.setVisibleFields` — no prop-threading, mirroring
 * `GroupByControl`. Renders nothing on a single-field surface (nothing to
 * configure); the contribution's `isApplicable` gates the menu on the same
 * condition so the gear never opens onto an empty section.
 */
export function PropertiesControl(): ReactNode {
  const { fields, activeState, activeViewId, viewModel } = useDataViewSettings();

  const setVisibleFields = useCallback(
    (ids: string[] | null) => viewModel.setVisibleFields(activeViewId, ids),
    [viewModel, activeViewId],
  );
  const controller = useVisibleFieldsController(
    fields,
    activeState.visibleFields ?? null,
    setVisibleFields,
  );

  if (fields.length <= 1) return null;

  return (
    <Stack gap="sm">
      <SectionLabel>Properties</SectionLabel>
      <SortableList
        items={controller.items.map((i) => i.field.id)}
        orientation="vertical"
        onMove={(activeId, overId) => {
          const toIndex = controller.items.findIndex(
            (i) => i.field.id === overId,
          );
          if (toIndex !== -1) controller.move(activeId, toIndex);
        }}
      >
        <Stack gap="2xs">
          {controller.items.map((item) => (
            <PropertyRow
              key={item.field.id}
              id={item.field.id}
              label={item.field.label}
              visible={item.visible}
              onToggle={controller.toggle}
            />
          ))}
        </Stack>
      </SortableList>
      <Button
        variant="ghost"
        disabled={!controller.isCustomized}
        onClick={controller.showAll}
      >
        <MdVisibility />
        Show all fields
      </Button>
    </Stack>
  );
}
