import { defineSlot } from "@core";
import type { ComponentType } from "react";
import type { ConversationItemConv } from "./components/conversation-item";

// Per-row slots for the conversation item primitive.
//
// The namespace is `Item` (matching the plugin id) because `ConversationItem`
// is already taken by the React component.
//
// - `Chips`: small pills next to the title in the sidebar list. Contributions
//   render nothing when their data is unavailable for the conversation — the
//   slot host doesn't reserve space.
// - `Avatar`: leftmost circular avatar. The first contribution that returns a
//   non-null element wins; if none match, a blank placeholder of the same
//   width is rendered so all rows align by their title.
export const Item = {
  Chips: defineSlot<{
    component: ComponentType<{ conv: ConversationItemConv }>;
  }>("conversation-item.chips"),
  Avatar: defineSlot<{
    // Predicate run against the conversation. The first contribution that
    // returns true gets rendered; if none match, the slot host renders a
    // blank placeholder so all rows still align by their title.
    match: (conv: ConversationItemConv) => boolean;
    component: ComponentType<{ conv: ConversationItemConv }>;
  }>("conversation-item.avatar"),
};
