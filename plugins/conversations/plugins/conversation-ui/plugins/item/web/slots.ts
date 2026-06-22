import { defineRenderSlot, defineDispatchSlot } from "@plugins/primitives/plugins/slot-render/web";
import type { ComponentType } from "react";
import type { ConversationItemConv } from "./components/conversation-item";
import { AvatarFallback } from "./components/avatar-fallback";

// Per-row slots for the conversation item primitive.
//
// The namespace is `Item` (matching the plugin id) because `ConversationItem`
// is already taken by the React component.
//
// - `Chips`: small pills next to the title in the sidebar list. Contributions
//   render nothing when their data is unavailable for the conversation — the
//   slot host doesn't reserve space.
// - `Avatar`: leftmost circular avatar. Contributors supply a predicate
//   `match: (props) => boolean`; the first matching contribution wins. If
//   none match, the blank-disc fallback keeps all rows aligned by title.
export const Item = {
  Chips: defineRenderSlot<{
    component: ComponentType<{ conv: ConversationItemConv }>;
  }>("conversation-item.chips"),
  Avatar: defineDispatchSlot<{ conv: ConversationItemConv }, string>(
    "conversation-item.avatar",
    {
      // No string/regexp keys are used — all contributions match via predicate.
      // The id is a stable, unique string so the dispatch mechanism has a key
      // to pass to exact/regexp passes (they won't match; predicate path wins).
      key: (props) => props.conv.id,
      fallback: AvatarFallback,
    },
  ),
};
