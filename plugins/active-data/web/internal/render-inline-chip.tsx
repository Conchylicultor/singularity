import { createElement, type ReactNode } from "react";
import { inlineChipFor } from "./inline-registry";
import { ChipBoundary } from "./chip-boundary";

/**
 * THE rendering of one inline token: the chip that owns it, inside its boundary.
 *
 * `null` means no chip claims these characters — every caller renders the raw
 * text instead. That arm is load-bearing, not defensive: it is what lets a
 * document containing a chip node still hydrate and read correctly when the
 * plugin that owns the chip is not in the composition.
 *
 * Two things used to be restated at each render site and are stated here once:
 *
 * - the ANCHORED full-match rule that picks the chip (see `inlineChipFor`), and
 * - the `<ChipBoundary>` an inline chip needs because it never reaches the
 *   screen through `slot-render` (see `./chip-boundary`).
 *
 * Applying the boundary INSIDE means a consumer cannot render a chip
 * unboundaried — there is no way to get the raw component out of the registry.
 */
export function renderInlineChip(token: string): ReactNode | null {
  const chip = inlineChipFor(token);
  if (!chip) return null;
  return (
    <ChipBoundary chipId={chip.id} token={token}>
      {createElement(chip.component, { content: token, attrs: {} })}
    </ChipBoundary>
  );
}
