import type { ReactNode } from "react";
import { MdClose, MdAccountTree } from "react-icons/md";
import { IconButton } from "@plugins/primitives/plugins/icon-button/web";
import { Stack } from "@plugins/primitives/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/text/web";
import type {
  FieldDef,
  FilterConjunction,
  FilterRule,
} from "../../../core";
import { ConjunctionCell } from "./conjunction-cell";
import { FieldPicker } from "./field-picker";
import { OperatorPicker } from "./operator-picker";
import type { FilterEditorContext } from "./editor-context";

/**
 * One rule row: `[conjunction] [field ▾] [operator ▾] [value] [⤳ ✕]`. The value
 * editor is the resolved operator's `ValueInput` (rendered only when `hasValue`).
 * Remove is a direct, single-click affordance (no buried menu); "turn into group"
 * sits beside it as the advanced/grouping path — both hover-revealed.
 */
export function FilterRuleRow<TRow>(props: {
  rule: FilterRule;
  index: number;
  groupConjunction: FilterConjunction;
  onSetConjunction: (conjunction: FilterConjunction) => void;
  ctx: FilterEditorContext<TRow>;
}): ReactNode {
  const { rule, ctx } = props;
  const field = ctx.fields.find((f) => f.id === rule.fieldId);
  const opSet = field
    ? ctx.resolveOperatorSet(field.type ?? "text")
    : undefined;
  const operator = opSet?.operators.find((o) => o.id === rule.operatorId);
  const ValueInput = operator?.hasValue ? operator.ValueInput : undefined;

  return (
    <Stack
      direction="row"
      gap="xs"
      align="center"
      className="group/rule flex-wrap"
    >
      <ConjunctionCell
        index={props.index}
        conjunction={props.groupConjunction}
        onChange={props.onSetConjunction}
      />
      <FieldPicker
        fields={ctx.fields}
        value={rule.fieldId}
        onChange={(fieldId) => ctx.changeRuleField(rule.id, fieldId)}
      />
      {opSet ? (
        <OperatorPicker
          operators={opSet.operators}
          value={rule.operatorId}
          onChange={(operatorId) => ctx.changeRuleOperator(rule.id, operatorId)}
        />
      ) : (
        <Text as="span" variant="caption" tone="muted">
          (unknown field)
        </Text>
      )}
      {ValueInput && field ? (
        <ValueInput
          value={rule.value}
          onChange={(value) => ctx.setRuleValue(rule.id, value)}
          field={field as FieldDef<unknown>}
        />
      ) : null}
      <Stack
        direction="row"
        gap="2xs"
        align="center"
        className="ml-auto opacity-0 transition-opacity group-hover/rule:opacity-100 focus-within:opacity-100"
      >
        <IconButton
          icon={MdAccountTree}
          label="Turn into group"
          size="icon-sm"
          onClick={() => ctx.wrapRuleInGroup(rule.id)}
        />
        <IconButton
          icon={MdClose}
          label="Remove filter"
          size="icon-sm"
          onClick={() => ctx.deleteNode(rule.id)}
        />
      </Stack>
    </Stack>
  );
}
