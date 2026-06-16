import type { ReactNode } from "react";
import { MdMoreHoriz, MdDelete, MdAccountTree } from "react-icons/md";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@plugins/primitives/plugins/ui-kit/web";
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
 * One rule row: `[conjunction] [field ▾] [operator ▾] [value] [⋯]`. The value
 * editor is the resolved operator's `ValueInput` (rendered only when
 * `hasValue`). The `⋯` menu deletes the rule or turns it into a group.
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
      <RuleMenu
        onDelete={() => ctx.deleteNode(rule.id)}
        onWrap={() => ctx.wrapRuleInGroup(rule.id)}
      />
    </Stack>
  );
}

function RuleMenu(props: {
  onDelete: () => void;
  onWrap: () => void;
}): ReactNode {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Rule options"
            title="Rule options"
            className="ml-auto opacity-0 transition-opacity group-hover/rule:opacity-100 aria-expanded:opacity-100"
          />
        }
      >
        <MdMoreHoriz />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={props.onWrap}>
          <MdAccountTree />
          Turn into group
        </DropdownMenuItem>
        <DropdownMenuItem variant="destructive" onClick={props.onDelete}>
          <MdDelete />
          Delete rule
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
