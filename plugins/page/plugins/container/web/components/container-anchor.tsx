import type { ReactNode } from "react";
import { Center } from "@plugins/primitives/plugins/css/plugins/center/web";
import type { BlockEditorAPI } from "@plugins/page/plugins/editor/web";
import {
  ContainerAppearancePopover,
  type ContainerAppearance,
} from "../internal/appearance-popover";

export type ContainerAnchorProps = {
  /**
   * The block API, on editable surfaces only. Absent ⇒ this renders a static
   * glyph: the blog renderer and the version-history preview have no block API
   * at all, and a dead control there would be worse than none.
   */
  editor?: BlockEditorAPI;
  /**
   * The container's leading glyph, already styled by the consumer (size + any
   * tint). The glyph is the ONE appearance channel the shell exposes: the shell
   * owns the box, the trigger and the popover, never the look of the mark
   * inside it.
   */
  glyph: ReactNode;
} & ContainerAppearance;

/**
 * A void container's GUTTER decoration — a leading mark, seated in the box's own
 * indent column on its first visible child's borrowed first line, so the mark
 * and that line read as one.
 *
 * This is the seat for a decoration that is CONTENT: the callout's icon, which
 * its author chose and which says what the card means. It is always there and it
 * leads the text. A card whose decoration is merely its type NAME takes the
 * other seat — `ContainerCornerLabel` — which costs nothing at rest.
 *
 * The container renders no line of its own: its row collapses to zero height and
 * the SURFACE mounts this in a `BLOCK_INDENT`-wide column at the box's left
 * inset. So this renders appearance + interaction only — it must not position or
 * size itself, and must not establish flow height (see `BlockAnchorProps`).
 *
 * ## Why the structural actions left
 *
 * They lived here because an anchor row paints no hover rail and there was
 * nowhere else to hang a block-actions menu. There is now: the rail on the line
 * the container BORROWS resolves the container as its owner
 * (`page/editor`'s `internal/rail-seat.ts`), so its `⠿` handle opens a menu that
 * carries Collapse / Remove `<name>` / Delete — generically, deriving the
 * container's name from its handle's label. Nothing about them was
 * container-plugin-specific, so nothing about them is here any more.
 *
 * ## Two branches, one contribution
 *
 * A container with no `sections` renders a plain, non-interactive glyph on BOTH
 * surfaces: with the structural actions gone, its popover would open on nothing.
 * A container WITH sections still needs the static-vs-interactive branch on
 * `editor`, and that branch is load-bearing beyond styling — `sections` is handed
 * a definitely-present `BlockEditorAPI` and its controls write through it, so on
 * a surface that has no API there is no honest thing to render but the mark.
 */
export function ContainerAnchor(props: ContainerAnchorProps) {
  // Narrowed on `sections`, which the union ties to `triggerLabel`/`width`.
  if (!props.editor || props.sections === undefined) {
    return <Center className="w-full">{props.glyph}</Center>;
  }
  return (
    <ContainerAppearancePopover
      editor={props.editor}
      trigger={<Center className="size-full">{props.glyph}</Center>}
      triggerClass={TRIGGER_CLASS}
      sections={props.sections}
      triggerLabel={props.triggerLabel}
      width={props.width}
      panel={props.panel}
    />
  );
}

/** The glyph's own chrome. */
const TRIGGER_CLASS =
  "hover:bg-accent size-full rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring";
