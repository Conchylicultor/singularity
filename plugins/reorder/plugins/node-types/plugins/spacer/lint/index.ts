import noSplitSlotRow from "./no-split-slot-row";

/**
 * Lint barrel for the `no-split-slot-row` rule. The root `eslint.config.ts`
 * auto-discovers this default export and registers the rule repo-wide as `error`.
 *
 * It lives with the spacer node type because the spacer is the answer it points
 * to: position within a slot is a spacer in the slot's order config, never a
 * second slot.
 *
 * `ignores` exempts the browser toolbar, whose three slots (nav controls, the
 * omnibox, actions) are different kinds of thing — the omnibox is a single
 * growing occupant, not a movable item among the buttons.
 */
export default {
  name: "spacer",
  rules: {
    "no-split-slot-row": noSplitSlotRow,
  },
  ignores: {
    "no-split-slot-row": [
      "plugins/apps/plugins/browser/plugins/shell/web/components/browser-layout.tsx",
    ],
  },
};
