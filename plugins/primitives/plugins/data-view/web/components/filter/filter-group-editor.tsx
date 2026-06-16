import type { ReactNode } from "react";
import { MdAdd, MdMoreHoriz, MdDelete } from "react-icons/md";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@plugins/primitives/plugins/ui-kit/web";
import { Stack, Inset } from "@plugins/primitives/plugins/spacing/web";
import { Surface } from "@plugins/primitives/plugins/surface/web";
import { Text } from "@plugins/primitives/plugins/text/web";
import type { FilterConjunction, FilterGroup } from "../../../core";
import { ConjunctionCell } from "./conjunction-cell";
import { FilterRuleRow } from "./filter-rule-row";
import type { FilterEditorContext } from "./editor-context";

/**
 * Recursive editor for one group's children. Each child renders with its
 * conjunction column (Where / And-Or dropdown / static). Nested groups render
 * indented inside a sunken Surface with their own conjunction column, add
 * affordance, and a `⋯` delete (root has no delete — clearing is the footer's
 * job). Empty groups show a muted placeholder.
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
              className="group/group flex-wrap"
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
                      <GroupMenu onDelete={() => ctx.deleteNode(child.id)} />
                    </Stack>
                    <FilterGroupEditor group={child} ctx={ctx} />
                    <AddAffordance
                      onAddRule={() => ctx.addRule(child.id)}
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

function GroupMenu(props: { onDelete: () => void }): ReactNode {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Group options"
            title="Group options"
            className="opacity-0 transition-opacity group-hover/group:opacity-100 aria-expanded:opacity-100"
          />
        }
      >
        <MdMoreHoriz />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem variant="destructive" onClick={props.onDelete}>
          <MdDelete />
          Delete group
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** `+ Add filter rule ▾` menu (Add rule / Add filter group). */
export function AddAffordance(props: {
  onAddRule: () => void;
  onAddGroup: () => void;
}): ReactNode {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="sm"
            aria-label="Add filter"
            className="self-start"
          />
        }
      >
        <MdAdd />
        Add filter rule
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuItem onClick={props.onAddRule}>Add rule</DropdownMenuItem>
        <DropdownMenuItem onClick={props.onAddGroup}>
          Add filter group
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
