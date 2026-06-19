import type { ReactNode } from "react";
import { MdDelete } from "react-icons/md";
import {
  Button,
  DropdownMenuSeparator,
} from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Frame } from "@plugins/primitives/plugins/css/plugins/frame/web";
import { SortableList } from "@plugins/primitives/plugins/sortable-list/web";
import type { SortController } from "../../internal/use-sort-controller";
import { FieldSearchList } from "../filter/field-search-list";
import { SortRuleRow } from "./sort-rule-row";
import { AddSortAffordance } from "./add-sort-affordance";

/**
 * Popover body. With no rules yet it IS the search-first `FieldSearchList`
 * ("Sort by…" typeahead over the sortable fields) preceded by a one-line guide —
 * picking a field adds the first sort level in one click. Once populated it hosts
 * the reorderable rule list (drag = change priority), an `Add sort` affordance
 * over the fields not yet used, and a `Delete sort` footer (clears every level).
 * A field can be sorted at most once, so each row's picker offers only the fields
 * not used by OTHER rows.
 */
export function SortBuilderPopover<TRow>(props: {
  controller: SortController<TRow>;
  onClose: () => void;
}): ReactNode {
  const { controller } = props;
  const usedIds = new Set(controller.rules.map((r) => r.fieldId));
  const availableToAdd = controller.sortableFields.filter(
    (f) => !usedIds.has(f.id),
  );

  return (
    <Stack gap="sm">
      {controller.rules.length === 0 ? (
        <>
          <Text as="div" variant="caption" tone="muted" className="px-2xs">
            No sorts yet — pick a field to sort by.
          </Text>
          <FieldSearchList
            fields={availableToAdd}
            placeholder="Sort by…"
            onPick={controller.addRule}
          />
        </>
      ) : (
        <>
          <SortableList
            items={controller.rules.map((r) => r.fieldId)}
            orientation="vertical"
            onMove={(activeId, overId) => {
              const toIndex = controller.rules.findIndex(
                (r) => r.fieldId === overId,
              );
              if (toIndex !== -1) controller.move(activeId, toIndex);
            }}
          >
            <Stack gap="xs">
              {controller.rules.map((rule) => (
                <SortRuleRow
                  key={rule.fieldId}
                  rule={rule}
                  fields={controller.sortableFields.filter(
                    (f) => !usedIds.has(f.id) || f.id === rule.fieldId,
                  )}
                  onChangeField={(next) =>
                    controller.setField(rule.fieldId, next)
                  }
                  onSetDirection={(dir) =>
                    controller.setDirection(rule.fieldId, dir)
                  }
                  onRemove={() => controller.removeRule(rule.fieldId)}
                />
              ))}
            </Stack>
          </SortableList>
          {availableToAdd.length > 0 ? (
            <AddSortAffordance
              fields={availableToAdd}
              onPick={controller.addRule}
            />
          ) : null}
          <DropdownMenuSeparator />
          {/* `<Frame leading>` so the footer button hugs its content and packs
              left (the row's single rigid `auto` track) — the sanctioned
              alternative to a raw `self-start`. */}
          <Frame
            leading={
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  controller.clear();
                  props.onClose();
                }}
              >
                <MdDelete />
                Delete sort
              </Button>
            }
          />
        </>
      )}
    </Stack>
  );
}
