import { defineSlot } from "@core";
import type { ComponentType } from "react";
import type { ConversationItemConv } from "./components/conversation-item";

// Per-row chip slot. Plugins contribute small pills that appear next to the
// title in the sidebar list. Contributions render nothing when their data is
// unavailable for the conversation — the slot host doesn't reserve space.
//
// The namespace is `Item` (matching the plugin id) because `ConversationItem`
// is already taken by the React component.
export const Item = {
  Chips: defineSlot<{
    component: ComponentType<{ conv: ConversationItemConv }>;
  }>("conversation-item.chips"),
};
