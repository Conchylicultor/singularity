import type { ReactNode } from "react";
import { MdClose, MdAccountTree } from "react-icons/md";
import { IconButton } from "@plugins/primitives/plugins/icon-button/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import {
  useHoverReveal,
  hoverRevealClass,
} from "@plugins/primitives/plugins/hover-reveal/web";
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
 * One rule row: `[conjunction] [field ▾] [operator ▾] [value] [⤳ ✕]` — a tidy
 * single line (no wrap) whose columns align rail-to-rail across rows. The value
 * editor is the resolved operator's `ValueInput` (rendered only when `hasValue`),
 * hosted in a flex-1 cell so it fills the remaining width and the trailing
 * actions stay pinned to the row edge. Remove is a direct, single-click
 * affordance (no buried menu); "turn into group" sits beside it as the
 * advanced/grouping path — both hover-revealed.
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
  const { revealed, groupProps } = useHoverReveal();

  return (
    <Stack direction="row" gap="xs" align="center" {...groupProps}>
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
      {/* The flexible value cell absorbs the remaining row width (text/number
          inputs fill, chip grids flow). It renders even for value-less operators
          (e.g. "Is empty") so the trailing actions stay pinned to the row edge
          instead of jumping. */}
      <div className="min-w-0 flex-1">
        {ValueInput && field ? (
          <ValueInput
            value={rule.value}
            onChange={(value) => ctx.setRuleValue(rule.id, value)}
            field={field as FieldDef<unknown>}
          />
        ) : null}
      </div>
      <Stack
        direction="row"
        gap="2xs"
        align="center"
        className={cn("shrink-0", hoverRevealClass(revealed))}
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
