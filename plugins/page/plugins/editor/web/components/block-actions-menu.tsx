import { useMemo, useState, type ReactElement } from "react";
import {
  MdContentCopy,
  MdDelete,
  MdRemoveCircleOutline,
  MdUnfoldLess,
  MdUnfoldMore,
} from "react-icons/md";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Row } from "@plugins/primitives/plugins/css/plugins/row/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { useCopyToClipboard } from "@plugins/primitives/plugins/copy-to-clipboard/web";
import { showToast } from "@plugins/shell/plugins/toast/web";
import { InlinePopover, type InlinePopoverProps } from "@plugins/primitives/plugins/popover/web";
import { PAGE_BLOCK_TYPE, type Block } from "../../core";
import type { BlockEditorAPI } from "../types";
import { Editor, useBlockFrameMenus } from "../slots";
import { useBlockHandles } from "../internal/block-handles";
import { useBlockEditor } from "../block-editor-context";
import { useInsertableBlocks, BlockTypeList } from "./block-type-list";

/** The menu's own hairline separator between two zones. Shared by both arms. */
function Separator() {
  // eslint-disable-next-line spacing/no-adhoc-spacing -- my-0.5 is a hairline separator's own inset between the menu's two zones; not a Stack-gap rhythm (the surrounding gap-xs is intentionally tighter)
  return <div className="bg-border my-0.5 h-px" />;
}

/**
 * Per-block actions popover, opened from the gutter drag handle — the ONE rail
 * popover, dispatching on what the rail's seat OWNS.
 *
 * Two arms, and which one renders is decided by a CORE fact about the owner:
 *
 * - **an ordinary block** — a "Turn into" section listing insertable block types
 *   (→ `api.convertTo`) plus any `Editor.TurnInto` contributions, then "Delete"
 *   (→ `api.remove`). Sub-page rows get only "Delete" — see `convertible`.
 * - **a void CONTAINER** (`BlockHandle.anchor`) — its contributed appearance
 *   sections, then the STRUCTURAL actions: Collapse/Expand, Remove `<label>`,
 *   Delete. No "Turn into": a container owns no text, so converting it away has
 *   nowhere to put its children and is not an offer this menu can honour.
 *
 * The container arm is selected by `handle.anchor === true` and **not** by the
 * presence of a `menu` contribution: `context` contributes no sections (its
 * payload is `{}`) and must still get the structural actions. Ownership itself
 * is not resolved here — `RailSeat.owner` already did it, with the whole flatten
 * in view; this component only ever sees the block the rail acts on.
 */
export function BlockActionsMenu({
  trigger,
  block,
  api,
  childCount,
  align = "start",
  side = "bottom",
}: {
  trigger: ReactElement;
  block: Block;
  api: BlockEditorAPI;
  /**
   * How many children the block has in the FOREST, visible or folded away — the
   * seat owner's, threaded from `RailSeat.owner.childCount`. Only the container
   * arm reads it (a fold is worth offering from 2 children up), and it comes
   * from the seat rather than a lookup here because the rail's owner is not
   * necessarily the row that rendered it, so this component has no forest to ask.
   */
  childCount: number;
  align?: InlinePopoverProps["align"];
  side?: InlinePopoverProps["side"];
}) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const blocks = useInsertableBlocks();
  // Turn-into stays flat: it keeps its own "Turn into" eyebrow (below), so it
  // passes one label-less section and ignores the config's group boundaries
  // while still inheriting the flattened config order.
  const sections = useMemo(() => [{ blocks }], [blocks]);
  const { serverSync, unwrapBlock } = useBlockEditor();
  const handle = useBlockHandles().get(block.type);
  const ContainerMenu = useBlockFrameMenus().get(block.type);
  const isContainer = handle?.anchor === true;

  // A page row is not convertible. Converting it away from `page` would orphan
  // every row keyed `page_id = <this block's id>` — that subtree lives in
  // another partition and no query would ever reach it again. (The server
  // rejects the transition too; this hides the affordance that produces it.)
  const convertible = block.type !== PAGE_BLOCK_TYPE;

  // The container's name in the "Remove <name>" wording is DERIVED from the
  // handle's insert-menu label rather than passed in, so the action can never
  // describe a different container than the one it dissolves — and a new
  // container type needs no wiring here at all. A container with no `label` is
  // not offered in the palette either, so it has no user-facing name to use;
  // "container" is the honest generic, not a swallowed miss.
  const containerName = handle?.label?.toLowerCase() ?? "container";

  // Copying the id is the one action that applies to EVERY seat owner — an
  // ordinary block, a void container, and the page row alike — so it sits
  // outside both arms, beside Delete.
  const { copy: copyBlockId } = useCopyToClipboard(block.id);

  const close = () => setOpen(false);
  // Every commit fires on `onMouseDown` after a `preventDefault`: the handle sits
  // beside a live caret, and a plain click would blur the block's editor (moving
  // the DOM selection) before the action runs.
  const commit = (run: () => void) => (e: React.MouseEvent) => {
    e.preventDefault();
    run();
    close();
  };

  return (
    <InlinePopover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setActiveIndex(-1);
      }}
      align={align}
      side={side}
      // Contributed sections host arbitrary controls — today a full icon picker
      // — so a menu carrying them takes the wide role; the structural actions
      // and the turn-into list both fit the narrow one.
      width={ContainerMenu ? "xl" : "sm"}
      padding="xs"
      trigger={trigger}
    >
      <Stack gap="xs">
        {isContainer ? (
          <>
            {/* The container's own appearance, contributed by its plugin. The
                SAME component also renders in the glyph's popover: appearance is
                deliberately reachable from both, because the rail is where a
                user looks for block actions and the glyph is where they look for
                the glyph. */}
            {ContainerMenu ? (
              <>
                {/* eslint-disable-next-line react-hooks/static-components -- not a component CREATED during render: `ContainerMenu` is a registry LOOKUP into the memoized `useBlockFrameMenus()` map, whose values are module-level slot contributions. Its identity is stable across renders, so no state can reset. */}
                <ContainerMenu block={block} api={api} close={close} />
                <Separator />
              </>
            ) : null}
            {/* Collapse/Expand is the fold's FALLBACK. The primary affordance is
                the chevron on the container's borrowed line, which cannot always
                serve it: nested containers share one line so only the outermost
                claims a chevron, and a first child whose own chevron is
                load-bearing keeps it (`internal/rail-seat.ts`). With one child
                there is nothing to offer — the container's fold and its child's
                hide the same lines. */}
            {childCount > 1 && (
              <Row
                icon={block.expanded ? <MdUnfoldLess /> : <MdUnfoldMore />}
                onMouseDown={commit(() => api.setExpanded(!block.expanded))}
              >
                {block.expanded ? "Collapse" : "Expand"}
              </Row>
            )}
            {/* Remove and Delete are DIFFERENT intents and must stay separate.
                Remove dissolves the box and promotes the children into its slot
                (the `unwrap` op — the escape hatch that keeps the content, and
                what Backspace at the start of the first child resolves to);
                Delete takes the subtree with it, exactly as any other block's
                Delete does. A single "delete the container" would conflate them. */}
            <Row
              icon={<MdRemoveCircleOutline />}
              onMouseDown={commit(() => unwrapBlock(block.id))}
            >
              {`Remove ${containerName}`}
            </Row>
          </>
        ) : convertible ? (
          <>
            <Text
              as="div"
              variant="caption"
              className="text-muted-foreground px-sm pt-xs font-medium uppercase tracking-wide"
            >
              Turn into
            </Text>
            <BlockTypeList
              sections={sections}
              activeIndex={activeIndex}
              onHoverIndex={setActiveIndex}
              // `target`, not `handle`: the container arm above already binds
              // `handle` to the OWNER's handle, and a parameter shadowing it here
              // would read as the same value while being the conversion target.
              onSelect={(target) => {
                // Only the target's NON-text defaults: the block keeps its id,
                // hence its content doc, so `convertTo` carries its text over.
                api.convertTo(target.type, target.emptyRowData());
                close();
              }}
            />
            {/* A `TurnInto` contribution converts a block into something the
                editor's own pure `convertTo` cannot express — a server-backed
                transition (today: into a sub-page, re-partitioning `page_id`
                across a page boundary). None of that exists without rows, so the
                whole zone is gated on `serverSync` rather than per-contributor. */}
            {serverSync ? (
              <Editor.TurnInto.Render>
                {(a) => <a.component block={block} api={api} close={close} />}
              </Editor.TurnInto.Render>
            ) : null}
            <Separator />
          </>
        ) : null}
        {/* The popover closes on commit, so the hook's own `copied` flash is
            never seen — the toast is the feedback. */}
        <Row
          icon={<MdContentCopy />}
          onMouseDown={commit(() => {
            copyBlockId();
            showToast({ description: "Block ID copied" });
          })}
        >
          Copy block ID
        </Row>
        <Row
          className="text-destructive"
          icon={<MdDelete />}
          onMouseDown={commit(() => api.remove())}
        >
          Delete
        </Row>
      </Stack>
    </InlinePopover>
  );
}
