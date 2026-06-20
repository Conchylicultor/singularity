import type { ReactNode } from "react";
import { MdClose, MdDragIndicator } from "react-icons/md";
import {
  cn,
  ControlSizeProvider,
} from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { IconButton } from "@plugins/primitives/plugins/icon-button/web";
import { Frame } from "@plugins/primitives/plugins/css/plugins/frame/web";
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
 * line laid out on a `<Frame>` so the rigid pickers (`leading`) never crush and
 * the hover-revealed remove (`trailing`) stays pinned to the row edge (Frame
 * auto-pins `trailing` via its inert spacer, so no `content` slot is needed).
 * The whole row is a `SortableItem` keyed by `fieldId` — priority = list order,
 * reordered by dragging the handle.
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
        <Frame
          gap="xs"
          align="center"
          {...groupProps}
          leading={
            <>
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
            </>
          }
          trailing={
            <ControlSizeProvider size="sm">
              <IconButton
                icon={MdClose}
                label="Remove sort"
                className={hoverRevealClass(revealed)}
                onClick={props.onRemove}
              />
            </ControlSizeProvider>
          }
        />
      )}
    </SortableItem>
  );
}
