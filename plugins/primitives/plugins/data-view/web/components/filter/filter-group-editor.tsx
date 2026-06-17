import type { ReactNode } from "react";
import { MdClose } from "react-icons/md";
import { IconButton } from "@plugins/primitives/plugins/icon-button/web";
import { Stack, Inset } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Surface } from "@plugins/primitives/plugins/css/plugins/surface/web";
import { Text } from "@plugins/primitives/plugins/text/web";
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
            <Stack
              key={child.id}
              direction="row"
              gap="xs"
              align="start"
              className="group/group"
            >
              <ConjunctionCell
                index={index}
                conjunction={group.conjunction}
                onChange={setConjunction}
              />
              <Surface
                level="sunken"
                className="min-w-0 flex-1 rounded-md border"
              >
                <Inset pad="sm">
                  <Stack gap="xs">
                    <Stack direction="row" gap="xs" align="center">
                      <Text
                        as="div"
                        variant="caption"
                        tone="muted"
                        className="mr-auto"
                      >
                        Filter group
                      </Text>
                      <IconButton
                        icon={MdClose}
                        label="Remove group"
                        size="icon-sm"
                        className="opacity-0 transition-opacity group-hover/group:opacity-100 focus-visible:opacity-100"
                        onClick={() => ctx.deleteNode(child.id)}
                      />
                    </Stack>
                    <FilterGroupEditor group={child} ctx={ctx} />
                    <AddFilterAffordance
                      fields={ctx.fields}
                      onPick={(fieldId) => ctx.addRuleForField(child.id, fieldId)}
                      onAddGroup={() => ctx.addGroup(child.id)}
                    />
                  </Stack>
                </Inset>
              </Surface>
            </Stack>
          ),
        )
      )}
    </Stack>
  );
}
