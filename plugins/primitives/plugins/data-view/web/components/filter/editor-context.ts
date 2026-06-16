import type {
  FieldDef,
  FilterConjunction,
  FilterOperatorSet,
} from "../../../core";

/**
 * Everything the recursive group editor + rule rows need to read the schema and
 * mutate the tree by node id. Built once by `FilterBuilderPopover` from the
 * controller + the local tree-edit ops, then threaded down so no child reaches
 * back into the controller or re-derives edit logic.
 */
export interface FilterEditorContext<TRow> {
  fields: FieldDef<TRow>[];
  resolveOperatorSet: (typeId: string) => FilterOperatorSet | undefined;

  // --- tree edits (all by node id, immutable, commit through setFilter) ---
  addRule: (groupId: string) => void;
  addGroup: (groupId: string) => void;
  setConjunction: (groupId: string, conjunction: FilterConjunction) => void;
  deleteNode: (id: string) => void;
  wrapRuleInGroup: (ruleId: string) => void;

  /** Set a rule's field, resetting operator → default and clearing value. */
  changeRuleField: (ruleId: string, fieldId: string) => void;
  /** Set a rule's operator, clearing value when `hasValue` toggled off. */
  changeRuleOperator: (ruleId: string, operatorId: string) => void;
  /** Write a rule's operand value. */
  setRuleValue: (ruleId: string, value: unknown) => void;
}
