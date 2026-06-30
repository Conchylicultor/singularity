import { useState, type ReactNode } from "react";
import { MdDragIndicator, MdViewColumn, MdVisibility } from "react-icons/md";
import { Button, cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Fill } from "@plugins/primitives/plugins/css/plugins/fill/web";
import { Row } from "@plugins/primitives/plugins/css/plugins/row/web";
import {
  SectionLabel,
  Text,
} from "@plugins/primitives/plugins/css/plugins/text/web";
import { CheckboxIndicator } from "@plugins/primitives/plugins/css/plugins/selection-indicator/web";
import { IconButton } from "@plugins/primitives/plugins/icon-button/web";
import { InlinePopover } from "@plugins/primitives/plugins/popover/web";
import { SortableItem, SortableList } from "@plugins/primitives/plugins/sortable-list/web";
import type { VisibleFieldsController } from "../internal/use-visible-fields-controller";

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
 * The Properties pill — a per-view-instance toolbar control governing which
 * fields render in the view body and in what order (Notion "Properties"). An
 * `IconButton` opening an `InlinePopover` whose body is a reorderable, toggleable
 * field list driven by the `VisibleFieldsController`, plus a "Show all fields"
 * reset footer. Mirrors `DataViewSettingsButton` (IconButton + InlinePopover) and
 * `SortBuilderPopover` (SortableList rows). The host gates it on `fields.length > 1`.
 */
export function PropertiesTrigger<TRow>(props: {
  controller: VisibleFieldsController<TRow>;
}): ReactNode {
  const { controller } = props;
  const [open, setOpen] = useState(false);

  return (
    <InlinePopover
      open={open}
      onOpenChange={setOpen}
      align="end"
      width="md"
      trigger={
        <IconButton icon={MdViewColumn} label="Properties" variant="ghost" />
      }
    >
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
    </InlinePopover>
  );
}
