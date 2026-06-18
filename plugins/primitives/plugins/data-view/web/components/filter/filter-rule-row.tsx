import type { ReactNode } from "react";
import { MdClose, MdAccountTree } from "react-icons/md";
import { IconButton } from "@plugins/primitives/plugins/icon-button/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Frame } from "@plugins/primitives/plugins/css/plugins/frame/web";
import { Clip } from "@plugins/primitives/plugins/css/plugins/clip/web";
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
 * single line (no wrap) laid out on a `<Frame>` so the CSS-grid shrink hierarchy
 * is structural: the rigid pickers (`leading`) never crush, the value cell
 * (`content`) fills the remaining width AND owns its overflow (`<Clip axis="x">`)
 * so a rigid value control can never overlap the trailing actions, and the
 * hover-revealed actions (`trailing`) stay pinned to the row edge. The value
 * editor is the resolved operator's `ValueInput` (rendered only when `hasValue`),
 * with the cell rendered even for value-less operators so trailing never jumps.
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
  const { revealed, groupProps } = useHoverReveal();

  return (
    <Frame
      gap="xs"
      align="center"
      {...groupProps}
      leading={
        <>
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
              onChange={(operatorId) =>
                ctx.changeRuleOperator(rule.id, operatorId)
              }
            />
          ) : (
            <Text as="span" variant="caption" tone="muted">
              (unknown field)
            </Text>
          )}
        </>
      }
      // The flexible value cell absorbs the remaining row width (text/number
      // inputs fill, chip grids flow). It OWNS its overflow via <Clip> so a
      // rigid value control (e.g. a SegmentedControl that refuses to shrink)
      // clips instead of overlapping the trailing actions. It renders even for
      // value-less operators (e.g. "Is empty") so the trailing actions stay
      // pinned to the row edge instead of jumping.
      content={
        <Clip axis="x">
          {ValueInput && field ? (
            <ValueInput
              value={rule.value}
              onChange={(value) => ctx.setRuleValue(rule.id, value)}
              field={field as FieldDef<unknown>}
            />
          ) : null}
        </Clip>
      }
      trailing={
        <Stack
          direction="row"
          gap="2xs"
          align="center"
          className={hoverRevealClass(revealed)}
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
      }
    />
  );
}
