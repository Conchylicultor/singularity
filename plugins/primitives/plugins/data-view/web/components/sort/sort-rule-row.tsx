import type { ReactNode } from "react";
import { MdClose, MdDragIndicator } from "react-icons/md";
import {
  cn,
  ControlSizeProvider,
} from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { IconButton } from "@plugins/primitives/plugins/icon-button/web";
import { SortableItem } from "@plugins/primitives/plugins/sortable-list/web";
import {
  useHoverReveal,
  hoverRevealClass,
} from "@plugins/primitives/plugins/hover-reveal/web";
import type { FieldDef, SortRule } from "../../../core";
import { useResolveDirectionLabels } from "../../internal/use-direction-labels";
import { FieldPicker } from "../filter/field-picker";
import { DirectionPicker } from "./direction-picker";

/**
 * One sort level: `[drag handle] [field ▾] [direction ▾] [✕]` — a flat single
 * line laid out as a `justify-between` flex row so the rigid pickers (left
 * cluster) never crush and the hover-revealed remove (right cluster) stays
 * pinned to the row edge. The whole row is a `SortableItem` keyed by `fieldId` —
 * priority = list order, reordered by dragging the handle.
 */
export function SortRuleRow<TRow>(props: {
  rule: SortRule;
  fields: FieldDef<TRow>[];
  onChangeField: (nextFieldId: string) => void;
  onSetDirection: (direction: "asc" | "desc") => void;
  onRemove: () => void;
}): ReactNode {
  const { rule } = props;
  const { revealed, groupProps } = useHoverReveal();
  const resolveDirectionLabels = useResolveDirectionLabels();
  const activeField = props.fields.find((f) => f.id === rule.fieldId);
  const directionLabels = resolveDirectionLabels(activeField?.type);

  return (
    <SortableItem
      id={rule.fieldId}
      handle
      className={({ isDragging }) => cn(isDragging && "opacity-40")}
    >
      {(state) => (
        <div
          {...groupProps}
          className="flex items-center justify-between gap-xs"
        >
          <div className="flex shrink-0 items-center gap-xs">
            <div
              {...state.handleProps}
              className="cursor-grab text-muted-foreground hover:text-foreground active:cursor-grabbing"
            >
              <MdDragIndicator className="size-4" />
            </div>
            <FieldPicker
              fields={props.fields}
              value={rule.fieldId}
              onChange={props.onChangeField}
              label="Sort field"
              placeholder="Sort by…"
            />
            <DirectionPicker
              value={rule.direction}
              labels={directionLabels}
              onChange={props.onSetDirection}
            />
          </div>
          <div className="flex shrink-0 items-center justify-end gap-xs">
            <ControlSizeProvider size="sm">
              <IconButton
                icon={MdClose}
                label="Remove sort"
                className={hoverRevealClass(revealed)}
                onClick={props.onRemove}
              />
            </ControlSizeProvider>
          </div>
        </div>
      )}
    </SortableItem>
  );
}
