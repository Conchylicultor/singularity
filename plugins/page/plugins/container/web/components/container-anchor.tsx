import { useState, type ReactNode } from "react";
import { MdDelete, MdRemoveCircleOutline } from "react-icons/md";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
  type PopoverWidth,
} from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Center } from "@plugins/primitives/plugins/css/plugins/center/web";
import { Row } from "@plugins/primitives/plugins/css/plugins/row/web";
import { useBlockEditor, type BlockEditorAPI } from "@plugins/page/plugins/editor/web";

export interface ContainerAnchorProps {
  /**
   * The container block's id. An anchor is the container's ONLY affordance (its
   * row carries no hover rail), so its menu owns the structural actions an
   * ordinary row gets from the gutter handle, and both are addressed by id.
   */
  id: string;
  /**
   * The block API, on editable surfaces only. Absent ⇒ this renders a static
   * glyph: the blog renderer and the version-history preview have no block API
   * at all, and a dead control there would be worse than none.
   */
  editor?: BlockEditorAPI;
  /**
   * The container's leading glyph, already styled by the consumer (size + any
   * tint). The glyph is the ONE appearance channel: the shell owns the box, the
   * trigger's affordances and the menu, never the look of the mark inside it.
   */
  glyph: ReactNode;
  /**
   * The container's human name in lowercase, e.g. `"callout"`. Used verbatim for
   * the "Remove <name>" action, so the wording of that action can never drift
   * from the container it dissolves.
   */
  name: string;
  /** The trigger's accessible name, e.g. `"Callout icon and color"`. */
  triggerLabel: string;
  /** Popover width role. Defaults to `"sm"` — enough for the two actions alone. */
  width?: PopoverWidth;
  /**
   * The container's own appearance controls, rendered ABOVE the shared
   * structural actions. Receives the (definitely present) block API and a
   * `close()` so a committing control can dismiss the popover the shell owns. A
   * container with no per-instance appearance simply omits it and gets a menu of
   * the two structural actions.
   */
  sections?: (ctx: { editor: BlockEditorAPI; close: () => void }) => ReactNode;
}

/**
 * A void container's ANCHOR decoration — the leading mark that is the only thing
 * its row paints.
 *
 * The container renders no line of its own: its row collapses to zero height and
 * the SURFACE mounts this in a `BLOCK_INDENT`-wide column at the container's
 * content edge `C`, seated on its first visible child's borrowed first-line
 * centre. So this renders appearance + interaction only — it must not position
 * or size itself, and must not establish flow height (see `BlockAnchorProps`).
 *
 * Two surfaces, one contribution: the static-vs-interactive branch is keyed on
 * `editor` and lives HERE rather than in each container, because the branch is
 * load-bearing beyond styling — the interactive arm calls `useBlockEditor()`,
 * which throws outside a `BlockEditorProvider`, so it must be a component the
 * read-only surface never mounts.
 */
export function ContainerAnchor({ editor, glyph, ...rest }: ContainerAnchorProps) {
  if (!editor) return <Center className="w-full">{glyph}</Center>;
  return <ContainerAnchorMenu editor={editor} glyph={glyph} {...rest} />;
}

/**
 * The interactive arm: the glyph as a popover trigger carrying the container's
 * whole block-actions menu.
 *
 * An anchor row renders no hover rail — its three gutter slots would coincide
 * with its first child's, on the same visual line, and the child must keep its
 * own handle — so there is nowhere to hang a `BlockActionsMenu`. Everything an
 * ordinary block gets from that handle therefore lives here: the surface gives
 * the column drag-to-move, and this popover carries the consumer's appearance
 * sections plus the two structural actions.
 *
 * **Remove <name>** and **Delete** are different intents and must stay
 * separate. Remove dissolves the box and promotes the children into its slot
 * (the `unwrap` reducer op) — the escape hatch that keeps the content, and the
 * same thing Backspace at the start of the first child resolves to. Delete
 * removes the container *with* its subtree, exactly as any other block's Delete
 * does. A single "delete the container" would conflate them.
 *
 * The trigger sits beside a live caret, so it `preventDefault`s its mousedown to
 * keep that caret put, and the actions commit on `onMouseDown` — the same shape
 * `BlockActionsMenu` uses, for the same reason.
 */
function ContainerAnchorMenu({
  id,
  editor,
  glyph,
  name,
  triggerLabel,
  width = "sm",
  sections,
}: ContainerAnchorProps & { editor: BlockEditorAPI }) {
  const [open, setOpen] = useState(false);
  const { unwrapBlock } = useBlockEditor();
  const close = () => setOpen(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        onMouseDown={(e) => e.preventDefault()}
        className="hover:bg-accent size-full rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={triggerLabel}
      >
        <Center className="size-full">{glyph}</Center>
      </PopoverTrigger>
      <PopoverContent width={width} padding="sm" align="start">
        {sections?.({ editor, close })}

        {/* Structural actions — the block-actions menu this container has no
            gutter handle to open. */}
        {/* eslint-disable-next-line spacing/no-adhoc-spacing -- hairline separator's own inset between the menu's zones, matching page-icon-button / avatar-picker */}
        <div className="my-1 h-px bg-border" />
        <Row
          size="sm"
          hover="accent"
          icon={<MdRemoveCircleOutline />}
          onMouseDown={(e: React.MouseEvent) => {
            e.preventDefault();
            unwrapBlock(id);
            close();
          }}
        >
          {`Remove ${name}`}
        </Row>
        <Row
          size="sm"
          hover="accent"
          className="text-destructive"
          icon={<MdDelete />}
          onMouseDown={(e: React.MouseEvent) => {
            e.preventDefault();
            editor.remove();
            close();
          }}
        >
          Delete
        </Row>
      </PopoverContent>
    </Popover>
  );
}
