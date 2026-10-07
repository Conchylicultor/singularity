import type { Exemptions } from "@plugins/framework/plugins/tooling/plugins/exempt/core";

export default [
  {
    rule: "spacer/no-split-slot-row",
    paths: ["web/components/browser-layout.tsx"],
    kind: "sanctioned",
    reason:
      "The browser toolbar's three slots (nav controls, the omnibox, actions) are different kinds of thing: the omnibox is a single growing occupant, not a movable item among the buttons.",
  },
] satisfies Exemptions;
