import { useState, type ReactNode } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
  type PopoverWidth,
} from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Center } from "@plugins/primitives/plugins/css/plugins/center/web";
import type { BlockEditorAPI } from "@plugins/page/plugins/editor/web";

/**
 * A container's per-instance APPEARANCE controls, and the two props that only
 * exist to present them. They travel together on purpose: a container with
 * nothing to configure (the context card, whose payload is `{}`) has no popover,
 * and therefore no trigger to give an accessible name to and no width to choose.
 * Making them one member of a union rather than three independent optionals is
 * what makes "a glyph with no appearance, but a trigger label" unrepresentable.
 */
type ContainerAppearance =
  | {
      /**
       * Rendered inside the glyph's popover, handed the (definitely present)
       * block API and a `close()` so a committing control can dismiss the
       * popover the shell owns.
       *
       * The SAME component should also be registered as the container's
       * `BlockFrameMeta.menu`, so appearance is reachable from the rail's block
       * actions too. That duplication is deliberate, not an oversight: the rail
       * is where a user looks for block actions, the glyph is where they look
       * for the glyph.
       */
      sections: (ctx: { editor: BlockEditorAPI; close: () => void }) => ReactNode;
      /** The trigger's accessible name, e.g. `"Callout icon and color"`. */
      triggerLabel: string;
      /** Popover width role. Defaults to `"sm"`. */
      width?: PopoverWidth;
    }
  | { sections?: never; triggerLabel?: never; width?: never };

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
 * A void container's ANCHOR decoration — the leading mark that is the only thing
 * its row paints, and now ONLY appearance.
 *
 * The container renders no line of its own: its row collapses to zero height and
 * the SURFACE mounts this in a `BLOCK_INDENT`-wide column at the container's
 * content edge `C`, seated on its first visible child's borrowed first-line
 * centre. So this renders appearance + interaction only — it must not position
 * or size itself, and must not establish flow height (see `BlockAnchorProps`).
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
      glyph={props.glyph}
      sections={props.sections}
      triggerLabel={props.triggerLabel}
      width={props.width}
    />
  );
}

/**
 * The interactive arm: the glyph as a popover trigger over the container's own
 * appearance controls.
 *
 * The trigger sits beside a live caret, so it `preventDefault`s its mousedown to
 * keep that caret put — the same shape `BlockActionsMenu` uses, for the same
 * reason. The popover's open state belongs here, so a control that commits and
 * should dismiss says so through the `close()` it is given rather than holding a
 * second copy of that state.
 */
function ContainerAppearancePopover({
  editor,
  glyph,
  triggerLabel,
  width = "sm",
  sections,
}: {
  editor: BlockEditorAPI;
  glyph: ReactNode;
  triggerLabel: string;
  width?: PopoverWidth;
  sections: (ctx: { editor: BlockEditorAPI; close: () => void }) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
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
        {sections({ editor, close })}
      </PopoverContent>
    </Popover>
  );
}
