import { useCallback, useMemo, type ReactNode } from "react";
import { MdDelete } from "react-icons/md";
import {
  Button,
  DropdownMenuSeparator,
} from "@plugins/primitives/plugins/ui-kit/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import type { FilterController } from "../../internal/use-filter-controller";
import type { FilterGroup } from "../../../core";
import {
  addGroup,
  addRule,
  deleteNode,
  emptyGroup,
  setConjunction,
  updateRule,
  wrapRuleInGroup,
} from "../../internal/filter-tree-ops";
import { FilterGroupEditor } from "./filter-group-editor";
import {
  AddFilterAffordance,
  AddGroupButton,
} from "./add-filter-affordance";
import { FieldSearchList } from "./field-search-list";
import type { FilterEditorContext } from "./editor-context";

/**
 * Popover body. With no rules yet it IS the search-first `FieldSearchList`
 * ("Filter by…" typeahead over the schema fields) — picking a field adds a rule
 * in one click. Once populated it hosts the recursive `FilterGroupEditor` plus an
 * `Add filter` affordance and a `Delete filter` footer (clears the whole tree).
 * The tree lazily materializes from a transient empty root on the first edit, so
 * opening with no filter shows the picker and nothing is committed until the user
 * actually adds something.
 */
export function FilterBuilderPopover<TRow>(props: {
  controller: FilterController<TRow>;
  onClose: () => void;
}): ReactNode {
  const { controller } = props;

  // The working root: the committed tree, or a transient empty root used to host
  // the empty state + add affordances before the first edit lands. This is the
  // SINGLE source of truth for the root id — both rendering and `commit` operate
  // on this exact object, so the footer's `addRuleForField(root.id, …)` always
  // targets a group that exists in the tree the edit is applied to (otherwise a
  // first edit before any committed filter would target a phantom id → no-op).
  const root: FilterGroup = useMemo(
    () => controller.filter ?? emptyGroup("and"),
    [controller.filter],
  );

  // A functional commit helper: apply `fn` to the working root and push the
  // result through setFilter.
  const commit = useCallback(
    (fn: (root: FilterGroup) => FilterGroup) => {
      controller.setFilter(fn(root));
    },
    [controller, root],
  );

  const ctx = useMemo<FilterEditorContext<TRow>>(() => {
    return {
      fields: controller.filterableFields,
      resolveOperatorSet: controller.resolveOperatorSet,
      addRuleForField: (groupId, fieldId) => {
        const field = controller.filterableFields.find((f) => f.id === fieldId);
        if (!field) return;
        const operatorId = resolveDefaultOpSet(controller, field.type ?? "text");
        commit((r) => addRule(r, groupId, fieldId, operatorId));
      },
      addGroup: (groupId) => commit((r) => addGroup(r, groupId, "and")),
      setConjunction: (groupId, conjunction) =>
        commit((r) => setConjunction(r, groupId, conjunction)),
      deleteNode: (id) => commit((r) => deleteNode(r, id)),
      wrapRuleInGroup: (ruleId) => commit((r) => wrapRuleInGroup(r, ruleId)),
      changeRuleField: (ruleId, fieldId) => {
        const field = controller.filterableFields.find((f) => f.id === fieldId);
        const operatorId = field
          ? resolveDefaultOpSet(controller, field.type ?? "text")
          : "";
        commit((r) =>
          updateRule(r, ruleId, { fieldId, operatorId, value: undefined }),
        );
      },
      changeRuleOperator: (ruleId, operatorId) =>
        commit((r) => updateRule(r, ruleId, { operatorId, value: undefined })),
      setRuleValue: (ruleId, value) =>
        commit((r) => updateRule(r, ruleId, { value })),
    };
  }, [controller, commit]);

  const hasContent = root.children.length > 0;

  return (
    <Stack gap="sm">
      {hasContent ? (
        <>
          <FilterGroupEditor group={root} ctx={ctx} isRoot />
          <AddFilterAffordance
            fields={ctx.fields}
            onPick={(fieldId) => ctx.addRuleForField(root.id, fieldId)}
            onAddGroup={() => ctx.addGroup(root.id)}
          />
          <DropdownMenuSeparator />
          <Button
            variant="ghost"
            size="sm"
            className="self-start"
            onClick={() => {
              controller.setFilter(null);
              props.onClose();
            }}
          >
            <MdDelete />
            Delete filter
          </Button>
        </>
      ) : (
        <FieldSearchList
          fields={ctx.fields}
          onPick={(fieldId) => ctx.addRuleForField(root.id, fieldId)}
          footer={<AddGroupButton onClick={() => ctx.addGroup(root.id)} />}
        />
      )}
    </Stack>
  );
}

/** Resolve a field type's default operator id (defaultOperator → operators[0]). */
function resolveDefaultOpSet<TRow>(
  controller: FilterController<TRow>,
  typeId: string,
): string {
  const set = controller.resolveOperatorSet(typeId);
  return set?.defaultOperator ?? set?.operators[0]?.id ?? "";
}
