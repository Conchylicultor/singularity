import {
  cn,
  Button,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
} from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import {
  ActionPresentation,
  ActionPresenceScope,
} from "@plugins/primitives/plugins/action-presentation/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Inset } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Line } from "@plugins/primitives/plugins/css/plugins/line/web";
import { SlotItemLayout } from "@plugins/primitives/plugins/slot-render/web";
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
 * Renders **nothing** when the bucket is empty — and *empty* means "no member
 * actually rendered", not "no member is authored". An item action returns `null`
 * for a row it does not apply to (Close on an already-closed conversation, Move
 * to top on the row that is already top), so a bucket holding five authored
 * actions can still come to nothing on a given row. Whether that is so is only
 * knowable after the members run, which is what the `probe` pass below does: the
 * members render once drawing no DOM, each announcing itself to the surrounding
 * `ActionPresenceScope`, and the `⋯` is painted only if at least one did. Without
 * it, such a row gets a `⋯` opening an empty menu.
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
    <ActionPresenceScope>
      {(hasActions) => (
        <>
          {/* The probe. Renders no DOM — it exists so the members can say
              whether they apply to this row before the trigger is painted. It
              stays mounted alongside the open menu (rather than swapping with
              it) so the answer keeps up with a row whose actions come and go — a
              conversation that starts running, a task that reaches the top of
              the queue — and so the trigger never blinks out for a frame as the
              menu closes. The cost is that a member exists twice while its menu
              is open, which the reorder wrappers only care about in edit mode —
              and edit mode takes the inline branch above, never this one. */}
          <ActionPresentation mode="probe">{children}</ActionPresentation>
          {hasActions ? (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="ghost"
                    aspect="icon"
                    aria-label={label}
                    title={label}
                  />
                }
              >
                <MdMoreHoriz />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {/* The members were rendered for the row this box sits in — a
                    flex row, so the slot wrapped each of them in a horizontal
                    `min-w-0` cell. Here they are stacked in a menu panel
                    instead, so that cell is a lie: it makes each row a flex
                    item that shrink-wraps to its own label, leaving the space
                    beside the text dead to the pointer. Declare where they
                    really landed. */}
                <SlotItemLayout orientation="column">
                  <ActionPresentation mode="menu">
                    {children}
                  </ActionPresentation>
                </SlotItemLayout>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </>
      )}
    </ActionPresenceScope>
  );
}
