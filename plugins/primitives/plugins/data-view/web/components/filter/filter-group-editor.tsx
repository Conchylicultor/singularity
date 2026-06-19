import type { ReactNode } from "react";
import { MdClose } from "react-icons/md";
import { IconButton } from "@plugins/primitives/plugins/icon-button/web";
import { Stack, Inset } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Surface } from "@plugins/primitives/plugins/css/plugins/surface/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import {
  useHoverReveal,
  hoverRevealClass,
} from "@plugins/primitives/plugins/hover-reveal/web";
import type { FilterConjunction, FilterGroup } from "../../../core";
import { ConjunctionCell } from "./conjunction-cell";
import { FilterRuleRow } from "./filter-rule-row";
import { AddFilterAffordance } from "./add-filter-affordance";
import type { FilterEditorContext } from "./editor-context";

/**
 * Recursive editor for one group's children. Each child renders with its
 * conjunction column (Where / And-Or dropdown / static). Nested groups render
 * indented inside a sunken Surface with their own conjunction column, add
 * affordance, and a direct remove button (root has no delete — clearing is the
 * footer's job). Empty groups show a muted placeholder.
 */
export function FilterGroupEditor<TRow>(props: {
  group: FilterGroup;
  ctx: FilterEditorContext<TRow>;
  /** False for the root group (no per-group delete; footer clears the whole tree). */
  isRoot?: boolean;
}): ReactNode {
  const { group, ctx } = props;
  const setConjunction = (c: FilterConjunction) =>
    ctx.setConjunction(group.id, c);

  return (
    <Stack gap="xs">
      {group.children.length === 0 ? (
        <Text as="div" variant="caption" tone="muted" className="px-2xs">
          No filters yet
        </Text>
      ) : (
        group.children.map((child, index) =>
          child.kind === "rule" ? (
            <FilterRuleRow
              key={child.id}
              rule={child}
              index={index}
              groupConjunction={group.conjunction}
              onSetConjunction={setConjunction}
              ctx={ctx}
            />
          ) : (
            <NestedGroupRow
              key={child.id}
              group={child}
              index={index}
              parentConjunction={group.conjunction}
              onSetConjunction={setConjunction}
              ctx={ctx}
            />
          ),
        )
      )}
    </Stack>
  );
}

/**
 * One nested child group: its conjunction column plus a sunken Surface holding
 * the group header (label + hover-revealed remove), the recursive editor, and an
 * add affordance. Split out so it can own its own `useHoverReveal` state — the
 * remove control is then scoped to this group only and never reveals from a
 * hover on a sibling rule or the parent group.
 */
function NestedGroupRow<TRow>(props: {
  group: FilterGroup;
  index: number;
  parentConjunction: FilterConjunction;
  onSetConjunction: (conjunction: FilterConjunction) => void;
  ctx: FilterEditorContext<TRow>;
}): ReactNode {
  const { group, ctx } = props;
  const { revealed, groupProps } = useHoverReveal();

  return (
    <Stack direction="row" gap="xs" align="start" {...groupProps}>
      <ConjunctionCell
        index={props.index}
        conjunction={props.parentConjunction}
        onChange={props.onSetConjunction}
      />
      {/* eslint-disable-next-line layout/no-adhoc-layout -- flexible group-box leaf: fills the conjunction row's remaining width and shrinks (Stack has no per-child grow prop) */}
      <Surface level="sunken" className="min-w-0 flex-1 rounded-md border">
        <Inset pad="sm">
          <Stack gap="xs">
            <Stack direction="row" gap="xs" align="center">
              <Text as="div" variant="caption" tone="muted" className="mr-auto">
                Filter group
              </Text>
              <IconButton
                icon={MdClose}
                label="Remove group"
                size="icon-sm"
                className={hoverRevealClass(revealed)}
                onClick={() => ctx.deleteNode(group.id)}
              />
            </Stack>
            <FilterGroupEditor group={group} ctx={ctx} />
            <AddFilterAffordance
              fields={ctx.fields}
              onPick={(fieldId) => ctx.addRuleForField(group.id, fieldId)}
              onAddGroup={() => ctx.addGroup(group.id)}
            />
          </Stack>
        </Inset>
      </Surface>
    </Stack>
  );
}
