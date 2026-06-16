import { useCallback, useMemo, type ReactNode } from "react";
import { MdDelete } from "react-icons/md";
import {
  Button,
  DropdownMenuSeparator,
} from "@plugins/primitives/plugins/ui-kit/web";
import { Stack } from "@plugins/primitives/plugins/spacing/web";
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
import { FilterGroupEditor, AddAffordance } from "./filter-group-editor";
import type { FilterEditorContext } from "./editor-context";

/**
 * Popover body. Hosts the root `FilterGroupEditor` over the controller's tree,
 * lazily materializing an empty root group on the first edit (so opening the
 * popover with no filter shows the empty state, and the tree is only committed
 * once the user actually adds something). Footer: `+ Add filter rule ▾` and
 * `Delete filter` (clears the whole tree → null).
 */
export function FilterBuilderPopover<TRow>(props: {
  controller: FilterController<TRow>;
  onClose: () => void;
}): ReactNode {
  const { controller } = props;

  // The working root: the committed tree, or a transient empty root used to
  // host the empty state + add affordances before the first edit lands. This
  // is the SINGLE source of truth for the root id — both rendering and `commit`
  // operate on this exact object, so the footer's `addRule(root.id, …)` always
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

  const defaultRuleSeed = useCallback(() => {
    const field = controller.filterableFields[0];
    if (!field) return null;
    const opSet = resolveDefaultOpSet(controller, field.type ?? "text");
    return { fieldId: field.id, operatorId: opSet };
  }, [controller]);

  const ctx = useMemo<FilterEditorContext<TRow>>(() => {
    return {
      fields: controller.filterableFields,
      resolveOperatorSet: controller.resolveOperatorSet,
      addRule: (groupId) => {
        const seed = defaultRuleSeed();
        if (!seed) return;
        commit((r) => addRule(r, groupId, seed.fieldId, seed.operatorId));
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
  }, [controller, commit, defaultRuleSeed]);

  return (
    <Stack gap="sm">
      <FilterGroupEditor group={root} ctx={ctx} isRoot />
      <AddAffordance
        onAddRule={() => ctx.addRule(root.id)}
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
