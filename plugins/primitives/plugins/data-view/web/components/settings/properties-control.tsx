import { useCallback, type ReactNode } from "react";
import { MdVisibility } from "react-icons/md";
import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { ControlPanel } from "@plugins/primitives/plugins/css/plugins/control-panel/web";
import {
  SortableItem,
  SortableList,
} from "@plugins/primitives/plugins/sortable-list/web";
import { useVisibleFieldsController } from "../../internal/use-visible-fields-controller";
import { dragHandleProps } from "../../internal/drag-handle-props";
import { useDataViewControls } from "../controls/controls-context";

/**
 * Properties setting (a `view`-scope settings contribution): a per-view-instance
 * control governing which fields render in the view body and in what order
 * (Notion "Properties"). A reorderable, toggleable field list driven by the
 * `VisibleFieldsController`, plus a "Show all fields" reset. Reads the field
 * schema + active-instance state from `DataViewControlsContext` and writes back
 * through `viewModel.setVisibleFields` — no prop-threading, mirroring
 * `GroupByControl`. Renders nothing on a single-field surface (nothing to
 * configure); the contribution's `isApplicable` gates the panel on the same
 * condition so the gear never opens onto an empty section.
 *
 * Each row is one `ControlPanel.Row`: the drag handle rides the row's own gutter
 * track and the visibility toggle is the row's `select="check"`, so the handle,
 * the checkbox and the label all sit on the same rails as every other panel row
 * — where before this list hand-built `[handle] [Row with a checkbox icon]` and
 * landed its label at a rail of its own.
 *
 * "Show all fields" is the section's LAST ROW, not the panel's footer: a
 * contribution owns a section, not the panel, and a footer placed from inside one
 * section would sit above whatever contribution came next.
 */
export function PropertiesControl(): ReactNode {
  const { fields, activeState, activeViewId, viewModel } =
    useDataViewControls();

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
    <ControlPanel.Section label="Properties">
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
        {controller.items.map((item) => (
          <SortableItem
            key={item.field.id}
            id={item.field.id}
            handle
            className={({ isDragging }) => cn(isDragging && "opacity-40")}
          >
            {(state) => (
              <ControlPanel.Row
                handle
                handleProps={dragHandleProps(state)}
                select="check"
                checked={item.visible}
                onSelect={() => controller.toggle(item.field.id)}
              >
                {item.field.label}
              </ControlPanel.Row>
            )}
          </SortableItem>
        ))}
      </SortableList>
      <ControlPanel.Row
        icon={<MdVisibility />}
        muted
        disabled={!controller.isCustomized}
        onSelect={controller.showAll}
      >
        Show all fields
      </ControlPanel.Row>
    </ControlPanel.Section>
  );
}
