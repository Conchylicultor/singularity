import { defineSlot } from "@plugins/framework/plugins/web-sdk/core";
import type { InlineChipContribution } from "./internal/inline-registry";

/**
 * The DECLARATION surface of an inline chip — what puts it in
 * `docs/plugins-details.md` and the reverse index. It only ever takes what
 * `inlineChip()` mints (the contribution type carries an unexported brand), and
 * nothing renders it through the slot: every reader goes through the module
 * registry in `./internal/inline-registry`, which the same call fills.
 */
export const InlineChip = {
  Tag: defineSlot<InlineChipContribution>({
    docLabel: (p) => p.id,
  }),
};
