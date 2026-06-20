import { useRef, type ComponentType } from "react";
import { MdWebAsset } from "react-icons/md";
import { Badge } from "@plugins/primitives/plugins/css/plugins/badge/web";
import { TruncatingText } from "@plugins/primitives/plugins/css/plugins/truncating-text/web";
import { useTabDragSession } from "../hooks/use-tab-drag";

/** Half the ghost width (px) so the chip rides centered under the cursor. */
const GHOST_HALF_W = 70;
/** Vertical offset (px) lifting the ghost just above the cursor. */
const GHOST_LIFT = 14;

/**
 * The live tab-chip drag visuals, rendered as part of the floating placement's
 * `Foreground` (a sibling above every window container, alongside the snap
 * preview and the dock). Reads the transient {@link useTabDragSession} channel
 * and paints:
 *
 * - a **drag ghost** — a strip-style chip (icon + label) riding under the cursor;
 * - an **insertion indicator** — a tinted ring + caret over the target window's
 *   tab-strip drop-zone (when hovering a strip), signalling "drops here";
 * - a **new-window hint** — the ghost framed as a dashed window outline (when
 *   over empty desktop), signalling a tear-off.
 *
 * Like the dock and snap overlay, everything is positioned `absolute` within the
 * backdrop (the Foreground's transformed parent breaks `position: fixed`), so the
 * overlay converts the viewport pointer / target rects to backdrop-relative
 * coords by subtracting the backdrop's own rect — read live each render from this
 * overlay's own offset parent (the backdrop), which is stable for a drag.
 */
export function TabDragOverlay() {
  const session = useTabDragSession();
  const rootRef = useRef<HTMLDivElement>(null);

  if (!session) return null;

  // The overlay root fills the backdrop (inset-0), so its own rect IS the
  // backdrop box — subtract it to map viewport coords into backdrop space.
  const originRect = rootRef.current?.getBoundingClientRect();
  const ox = originRect?.left ?? 0;
  const oy = originRect?.top ?? 0;

  const drop = session.drop;
  const Icon: ComponentType<{ className?: string }> = session.icon ?? MdWebAsset;
  const onDesktop = drop?.kind === "desktop";

  // The hovered strip's drop-zone rect (for the merge ring), if any.
  const stripRect =
    drop?.kind === "strip"
      ? document
          .querySelector<HTMLElement>(
            `[data-floating-window-id="${drop.windowId}"]`,
          )
          ?.getBoundingClientRect()
      : undefined;

  // The insertion caret x: the right edge of the last chip before the index, or
  // the strip's left edge when inserting first. Read from the live chip rects in
  // the hovered strip so it tracks the exact gap the tab would land in.
  let caretX: number | undefined;
  if (drop?.kind === "strip" && stripRect) {
    const chips = document
      .querySelector<HTMLElement>(
        `[data-floating-window-id="${drop.windowId}"]`,
      )
      ?.querySelectorAll<HTMLElement>("[data-floating-tab-id]");
    if (chips && chips.length > 0) {
      const before = chips[Math.min(drop.index, chips.length) - 1];
      caretX = before
        ? before.getBoundingClientRect().right
        : chips[0]!.getBoundingClientRect().left;
    } else {
      caretX = stripRect.left;
    }
  }

  return (
    <div
      ref={rootRef}
      aria-hidden
      // A genuine one-off: a full-bleed within-surface overlay anchor (like the
      // dock / snap preview) — Overlay would establish its own relative box, not
      // fill the backdrop; no positioning primitive models this.
      // eslint-disable-next-line layout/no-adhoc-layout -- transient drag-overlay anchor filling the backdrop; no positioning primitive applies
      className="pointer-events-none absolute inset-0 z-max"
    >
      {/* Merge target: a tinted ring over the hovered window's strip drop-zone. */}
      {stripRect && (
        <div
          // A genuine one-off: a highlight box derived from a live element rect —
          // no layout primitive models a transient drag-target outline.
          // eslint-disable-next-line layout/no-adhoc-layout -- transient merge-target ring positioned from a measured strip rect; no positioning primitive applies
          className="absolute rounded-md border-2 border-primary/70 bg-primary/10 transition-all duration-100 ease-out"
          style={{
            left: stripRect.left - ox - 3,
            top: stripRect.top - oy - 3,
            width: stripRect.width + 6,
            height: stripRect.height + 6,
          }}
        />
      )}

      {/* Insertion caret: a thin vertical bar at the computed insertion gap. */}
      {caretX !== undefined && stripRect && (
        <div
          // eslint-disable-next-line layout/no-adhoc-layout -- transient insertion caret positioned from measured chip rects; no positioning primitive applies
          className="absolute w-0.5 rounded-full bg-primary"
          style={{
            left: caretX - ox - 1,
            top: stripRect.top - oy + 2,
            height: stripRect.height - 4,
          }}
        />
      )}

      {/* The drag ghost: a strip-style chip riding under the cursor. On the empty
          desktop it gains a dashed outline to read as a new window. */}
      <div
        // eslint-disable-next-line layout/no-adhoc-layout -- transient drag ghost positioned from the live pointer; no positioning primitive applies
        className="absolute"
        style={{
          left: session.pointer.x - ox - GHOST_HALF_W,
          top: session.pointer.y - oy - GHOST_LIFT,
        }}
      >
        <Badge
          shape="rect"
          icon={<Icon />}
          colorClass={
            onDesktop
              ? "max-w-40 border-2 border-dashed border-primary/70 bg-background text-foreground shadow-lg"
              : "max-w-40 border border-border bg-background text-foreground shadow-lg"
          }
        >
          <TruncatingText className="max-w-28">{session.label}</TruncatingText>
        </Badge>
      </div>
    </div>
  );
}
