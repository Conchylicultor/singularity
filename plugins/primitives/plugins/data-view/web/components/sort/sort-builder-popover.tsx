import type { ReactNode } from "react";
import { MdClose } from "react-icons/md";
import {
  Button,
  DropdownMenuSeparator,
} from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { SortableList } from "@plugins/primitives/plugins/sortable-list/web";
import type { SortRule } from "../../../core";
import type { SortController } from "../../internal/use-sort-controller";
import type { SortPresetsController } from "../../internal/use-sort-presets";
import { resolvableRules } from "../../internal/sort-presets";
import { FieldSearchList } from "../filter/field-search-list";
import { SortRuleRow } from "./sort-rule-row";
import { AddSortAffordance } from "./add-sort-affordance";
import { PresetList } from "./presets/preset-list";
import { SavePresetAffordance } from "./presets/save-preset-affordance";

/**
 * Popover body. With no rules yet it IS the search-first `FieldSearchList`
 * ("Sort by…" typeahead over the sortable fields) preceded by a one-line guide —
 * picking a field adds the first sort level in one click. Once populated it hosts
 * the reorderable rule list (drag = change priority), an `Add sort` affordance
 * over the fields not yet used, and a `Clear sort` footer (clears every level).
 * A field can be sorted at most once, so each row's picker offers only the fields
 * not used by OTHER rows.
 */
export function SortBuilderPopover<TRow>(props: {
  controller: SortController<TRow>;
  presets: SortPresetsController;
  onClose: () => void;
}): ReactNode {
  const { controller, presets } = props;
  const usedIds = new Set(controller.rules.map((r) => r.fieldId));
  const availableToAdd = controller.sortableFields.filter(
    (f) => !usedIds.has(f.id),
  );
  const hasRules = controller.rules.length > 0;
  const hasPresets = presets.presets.length > 0;

  // Apply/save composed here, keeping the presets hook decoupled from the sort
  // controller: apply writes the preset's resolvable rules into the live sort;
  // save captures the current live rules under a typed name.
  const onApply = (rules: SortRule[]) =>
    controller.setRules(resolvableRules(rules, controller.sortableFields));

  return (
    <Stack gap="sm">
      <PresetList
        presets={presets.presets}
        sortableFields={controller.sortableFields}
        activeRules={controller.rules}
        onApply={(preset) => onApply(preset.rules)}
        onDelete={presets.deletePreset}
      />
      {hasPresets ? <DropdownMenuSeparator /> : null}
      {!hasRules ? (
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
          {/* `flex … justify-between` so the footer buttons hug their content:
              Save preset packs left, Clear sort pins right. */}
          <div className="flex items-center justify-between gap-sm">
            <SavePresetAffordance
              onSave={(label) => presets.savePreset(label, controller.rules)}
            />
            <Button
              variant="ghost"
              onClick={() => {
                controller.clear();
                props.onClose();
              }}
            >
              <MdClose />
              Clear sort
            </Button>
          </div>
        </>
      )}
    </Stack>
  );
}
