import {
  cn,
  Button,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
} from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { ActionPresentation } from "@plugins/primitives/plugins/action-presentation/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Inset } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Line } from "@plugins/primitives/plugins/css/plugins/line/web";
import { MdMoreHoriz } from "react-icons/md";
import { Children, type ReactNode } from "react";

type OverflowPayload = { label?: string };

/**
 * The `overflow` container node type's box. Two forms, keyed on edit mode:
 *
 * - **live** — one `⋯` dropdown holding the members as labelled menu rows. The
 *   members are opaque pre-rendered contributions, so the switch to menu form is
 *   made by the region, not the host: `<ActionPresentation mode="menu">` around
 *   the content, read by each action's `IconButton`.
 * - **edit mode** — a labelled inline box (mirroring `HeaderBox`) so an author
 *   can see and drag the bucket's members. A closed menu would suppress drag,
 *   and the pen affordances live on the members themselves.
 *
 * Renders **nothing** with no members: an emptied bucket must leave no dangling
 * trigger on the row.
 */
export function OverflowBox({
  payload,
  editMode,
  children,
}: {
  payload: OverflowPayload;
  editMode: boolean;
  children: ReactNode;
}) {
  const label = payload.label || "More";
  const empty = Children.toArray(children).length === 0;

  if (empty) return null;

  if (editMode) {
    return (
      <div className="rounded-md border border-border/50">
        <Inset x="xs" y="xs">
          <Line className="gap-2xs">
            <MdMoreHoriz className="size-3.5 text-muted-foreground" />
            <Text
              variant="caption"
              tone={payload.label ? "default" : "muted"}
              className={cn("truncate", !payload.label && "italic")}
            >
              {label}
            </Text>
          </Line>
        </Inset>
        <Inset x="xs" b="xs">
          {children}
        </Inset>
      </div>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" aspect="icon" aria-label={label} title={label} />
        }
      >
        <MdMoreHoriz />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <ActionPresentation mode="menu">{children}</ActionPresentation>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
