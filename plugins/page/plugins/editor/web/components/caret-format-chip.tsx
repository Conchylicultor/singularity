import { Badge } from "@plugins/primitives/plugins/css/plugins/badge/web";
import { ControlSizeProvider } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import type { Mark } from "../../core";
import { cueLabel } from "../internal/caret-format-cue";

/**
 * The collapsed caret's pending-mark cue, as a chip. Rendering only — WHEN to
 * show it and WHERE to put it are `FormatToolbarPlugin`'s (it owns the one
 * selection listener and the one positioning routine).
 *
 * `marks` is the set the next typed character will carry, and `[]` is a real
 * value here: it reads `plain`, which is the cue that matters most (a caret that
 * has just stepped out of a `` `code` `` run).
 *
 * Density: the cue is portaled through `ViewportOverlay`, so it inherits no
 * ambient `ControlSize` from the block it belongs to and would otherwise land on
 * the no-provider `"md"` default — far too heavy for a marker floating beside a
 * caret. It declares the smallest density itself.
 *
 * Non-interactive by construction: `pointer-events-none` (it must never take a
 * click meant for the text under it) and `aria-hidden` (a screen reader already
 * hears the editor's own formatting commands; a chip that re-announces the
 * pending state on every caret move would be noise, not information).
 *
 * **The `data-caret-format-cue` attribute is a pinned contract** — it carries
 * exactly the chip's visible text, and `e2e/pending-marks-cue-verify.ts` reads
 * the affordance through it. Keep the two in lockstep: they are one value.
 */
export function CaretFormatChip({ marks }: { marks: readonly Mark[] }) {
  const label = cueLabel(marks);
  return (
    <ControlSizeProvider size="xs">
      <Badge
        variant="muted"
        shape="pill"
        mono
        aria-hidden
        className="pointer-events-none"
        data-caret-format-cue={label}
      >
        {label}
      </Badge>
    </ControlSizeProvider>
  );
}
