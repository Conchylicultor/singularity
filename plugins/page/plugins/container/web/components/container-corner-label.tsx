import { useState, type ReactNode } from "react";
import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import {
  useFrameHovered,
  type BlockEditorAPI,
} from "@plugins/page/plugins/editor/web";
import {
  ContainerAppearancePopover,
  type ContainerAppearanceNone,
  type ContainerAppearanceSections,
} from "../internal/appearance-popover";

/**
 * The card's action rides with its `sections`, never alone: the action is a swap
 * of the TRIGGER's own text, so without a trigger there is nothing to swap and a
 * card would be promising something no click could deliver.
 */
type CornerAppearance =
  | (ContainerAppearanceSections & {
      /**
       * What the name BECOMES while the pointer is on it — the card's action, in
       * place, adding nothing. `/todo`'s `▷ Launch` is the one today. Omitted,
       * the name simply brightens.
       */
      action?: ReactNode;
    })
  | (ContainerAppearanceNone & { action?: never });

export type ContainerCornerLabelProps = {
  /**
   * The block API, on editable surfaces only. Absent ⇒ a static name: the blog
   * renderer and the version-history preview have no block API at all, and a
   * dead control there would be worse than none.
   */
  editor?: BlockEditorAPI;
  /**
   * The container's row id — how this asks whether the pointer is inside the
   * card. Absent (a read-only node that carries none) ⇒ the CSS group below is
   * the only reveal, which is exactly what the read-only surface provides.
   */
  blockId?: string;
  /** What the card calls itself, e.g. `"Todo"`. Rendered in caps. */
  name: string;
  /**
   * Keep the name visible at rest instead of only while the card is pointed at.
   *
   * For a card whose name is carrying STATE the reader would otherwise have to
   * go looking for — a TODO with an agent actually running on it. The default
   * (`false`) is the point of this seat: a name that only says what the tint
   * already says is worth nothing at rest and one glance on demand.
   */
  persist?: boolean;
  /** The card's hue, as a text-colour class. The one appearance channel. */
  className?: string;
} & CornerAppearance;

/**
 * A void container's CORNER decoration — the card's own name, pinned to the
 * top-right of the box it names, hidden until the pointer is inside that box.
 *
 * This is the seat for a decoration that is not content but an ANSWER: *what is
 * this box?* An annotation card has no mark of its own to show — its hue already
 * separates it from the prose — so a permanent glyph in the margin was paying a
 * fixed price, on every card, for something the reader wants only occasionally.
 * Here it costs nothing at rest, floats over the content when asked (reserving
 * no space, shifting nothing), and is the card's control when it has one.
 *
 * The seat is the SURFACE's business, as always: it is mounted in the frame
 * box's top-right corner and must not position itself. What is here is the
 * reveal, the chip, and the trigger.
 *
 * ## Two reveals, one component, because there are two surfaces
 *
 * The editor's frame is a grid SIBLING of the rows it spans, so a card has no
 * DOM ancestor for `group-hover` to travel up: it answers through the editor's
 * hover store, keyed by block id (`useFrameHovered`). The read-only renderer
 * nests through real wrapper divs, so it answers with the plain CSS group its
 * wrapper declares. Both are ORs into the same opacity, so a surface providing
 * either gets the behaviour and one providing neither still renders a static
 * name on `persist`.
 */
export function ContainerCornerLabel(props: ContainerCornerLabelProps) {
  const hovered = useFrameHovered(props.blockId);
  const revealed = hovered || props.persist === true;

  // Whether the pointer is on the NAME itself, as opposed to merely inside the
  // card. State rather than a CSS `group-hover:` swap between two spans, because
  // the span CSS hides is still in `textContent`: a chip rendering both would
  // read "TodoLaunch" to a screen reader, to find-in-page, and to every test
  // that asks the page what this card is called. What is on screen and what the
  // DOM says stay the same thing.
  const [onName, setOnName] = useState(false);

  // The name and its action are one chip that swaps its own text, so the card
  // gains no control when pointed at — the ANSWER becomes the affordance.
  const body = props.action !== undefined && onName ? props.action : props.name;

  return (
    <div
      // The handlers sit on the chip rather than on the trigger inside it: the
      // chip IS that trigger plus its own padding, so "on the name" and "on the
      // chip" are one gesture, and a card with no action needs no trigger to
      // hang them off.
      onPointerEnter={() => setOnName(true)}
      onPointerLeave={() => setOnName(false)}
      onFocusCapture={() => setOnName(true)}
      onBlurCapture={() => setOnName(false)}
      className={cn(
        CHIP_CLASS,
        props.className,
        // Not `hidden`: the name fades, and a chip that was never in the layout
        // has nothing to fade. It is `pointer-events-none` while invisible so an
        // unrevealed name is never a live click target over the card's own text.
        revealed
          ? "opacity-100"
          : "pointer-events-none opacity-0 group-hover/frame:pointer-events-auto group-hover/frame:opacity-100",
      )}
    >
      {!props.editor || props.sections === undefined ? (
        body
      ) : (
        <ContainerAppearancePopover
          editor={props.editor}
          trigger={body}
          triggerClass={TRIGGER_CLASS}
          sections={props.sections}
          triggerLabel={props.triggerLabel}
          width={props.width}
          panel={props.panel}
        />
      )}
    </div>
  );
}

/**
 * The chip: a small caps name on a nearly-opaque, blurred ground.
 *
 * The ground is what lets it float OVER the card's first line instead of
 * reserving a strip of its own — the same thing the code block's language pill
 * does, for the same reason. It has to be nearly opaque to do that job: measured
 * on a real page at `/70`, a long first line ran under the name and the two sets
 * of letters interleaved. `whitespace-nowrap` because a card's name wraps into
 * nonsense long before it wraps usefully.
 */
const CHIP_CLASS =
  "bg-background/90 rounded-md px-xs py-2xs text-caption font-semibold uppercase tracking-wider whitespace-nowrap backdrop-blur-sm transition-opacity";

/** The trigger inside the chip. The swap is state, not a CSS group — see above. */
const TRIGGER_CLASS =
  "hover:text-foreground cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm";
