import { Fill } from "@plugins/primitives/plugins/css/plugins/fill/web";
import { Row } from "@plugins/primitives/plugins/css/plugins/row/web";
import { insetClass } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { useRevealOnActive } from "@plugins/primitives/plugins/dom/plugins/scroll-reveal/web";
import type { OutlineEntry } from "../../core";
import { depthStep, ROW_INDENT } from "../internal/depth";

export interface OutlineRowProps {
  entry: OutlineEntry;
  active: boolean;
  onJump: (id: string) => void;
}

/**
 * One line of the expanded panel — and the accessible face of the outline (the
 * dash stack beside it is `aria-hidden`). `Row` infers a `<button>` from
 * `onClick` and stamps `aria-current` from `selected`.
 *
 * A component rather than an inline `.map()` body so the reveal hook has a
 * mount of its own: a long outline scrolls, and the current section must be in
 * view the moment the panel opens.
 *
 * `data-outline-row` / `data-outline-id` (plus the `aria-current` `Row` stamps
 * from `selected`) are the SUPPORTED addressing contract for cross-plugin e2e
 * scripts — see the rail's CLAUDE.md. They land on the row BOX, which is the
 * node this contract is about: the scroll-spy resolves an entry and then reads
 * where it sits on screen. `Row` guarantees that placement on both of its paths,
 * so giving these rows an action later cannot move the attributes onto an inner
 * button — which it silently did before `Row` routed its passthrough by
 * destination.
 */
export function OutlineRow({ entry, active, onJump }: OutlineRowProps) {
  // Transition-only (no `revealOnMount`): the panel is clamped to zero height
  // while closed, so a reveal fired at mount would ask the browser to scroll a
  // collapsed box and every ancestor above it for nothing.
  const rowRef = useRevealOnActive(active, { block: "nearest" });
  return (
    <Row
      ref={rowRef}
      size="sm"
      hover="muted"
      selected={active}
      data-outline-row=""
      data-outline-id={entry.id}
      onClick={() => onJump(entry.id)}
      className={insetClass({ l: ROW_INDENT[depthStep(entry.depth)] })}
    >
      <Fill>
        <Text variant="caption" tone={active ? "primary" : "muted"}>
          {entry.label}
        </Text>
      </Fill>
    </Row>
  );
}
