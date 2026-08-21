import { MdContentPaste, MdNotes, MdUploadFile } from "react-icons/md";
import { Badge } from "@plugins/primitives/plugins/css/plugins/badge/web";
import { Pin } from "@plugins/primitives/plugins/css/plugins/pin/web";
import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import type { ClaimedKind } from "../internal/drag-kind";

/** What the scrim promises to do with each kind of drag it claims. */
const HINTS: Record<ClaimedKind, { Icon: typeof MdUploadFile; label: string }> =
  {
    files: { Icon: MdUploadFile, label: "Drop file to add to this page" },
    forest: { Icon: MdContentPaste, label: "Drop blocks to add to this page" },
    text: { Icon: MdNotes, label: "Drop text to add to this page" },
  };

const KINDS = Object.keys(HINTS) as ClaimedKind[];

/** The fade shared by the scrim and every hint pill, so they move together. */
const FADE = "transition-opacity duration-150";

/**
 * Full-surface drop affordance shown while an EXTERNAL drag the container has
 * claimed is over the block editor (the Slack/Notion-style dimmed scrim): an
 * inset primary ring + a faint tint signal that the editor *as a whole* is a
 * valid drop target, plus a top-pinned hint pill so the action stays
 * discoverable over dense content and empty areas alike. The precise per-row
 * insertion line (rendered inside the blocks, painted above this scrim) keeps
 * showing exactly where the payload lands.
 *
 * `kind` is the live classification (`dragKindFromTypes`), `null` while no
 * claimed drag is in flight — so the pill names what will actually happen
 * instead of always promising a file.
 *
 * Rendered as an Overlay `above` layer, so it is `absolute inset-0
 * pointer-events-none` by construction — it never intercepts the native
 * dragover/drop events the container relies on. Always mounted; `kind` toggles
 * opacity so the scrim fades in/out rather than popping.
 *
 * **Every pill is mounted, and the label is a CROSS-FADE rather than a swap.**
 * `kind` goes null the instant the pointer leaves (or the payload lands), while
 * the scrim is still 150ms from invisible — so a single pill reading `kind`
 * would have to flicker to some default on the way OUT, drawing the eye to the
 * one thing that is disappearing. Three pinned pills at one anchor, each fading
 * on its own `kind === k`, hold the last label through that fade with no state,
 * no effect and nothing to keep in sync; a kind that changes mid-drag
 * cross-fades for free. `Pin to="top"` places each at the same point
 * (`absolute`, `left-1/2 -translate-x-1/2`), so they stack.
 */
export function ExternalDropOverlay({ kind }: { kind: ClaimedKind | null }) {
  return (
    <div
      aria-hidden
      className={cn(
        "size-full relative rounded-md bg-primary/5 ring-2 ring-inset ring-primary",
        FADE,
        kind !== null ? "opacity-100" : "opacity-0",
      )}
    >
      {KINDS.map((k) => {
        const { Icon, label } = HINTS[k];
        return (
          <Pin key={k} to="top" offset="md" decorative>
            <Badge
              variant="primary"
              shape="pill"
              icon={<Icon />}
              className={cn(FADE, kind === k ? "opacity-100" : "opacity-0")}
            >
              {label}
            </Badge>
          </Pin>
        );
      })}
    </div>
  );
}
