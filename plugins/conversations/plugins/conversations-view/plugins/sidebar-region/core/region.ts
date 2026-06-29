import type { MouseEvent } from "react";
import { defineVariantRegion } from "@plugins/ui/plugins/variant-region/core";

/**
 * The props every conversation-sidebar variant receives. Structurally identical
 * to `conversations-view`'s own `ViewProps` (the queue/grouped/history tabs),
 * but OWNED here so the variant region can be imported by the mount point
 * (`conversations-view`) without forming a cycle back into it. The two converge
 * when the tabbed view is eventually deleted.
 */
export interface ConversationSidebarProps {
  activeId: string | null;
  onNavigate: (id: string) => void;
  onCloseConversation: (id: string, e: MouseEvent) => Promise<void>;
}

/**
 * The conversation-sidebar variant region: swaps the sidebar's conversation body
 * between `classic` (today's tabbed Queue/Grouped/History `Host`) and, later, a
 * DataView-backed variant. Global scope (no `scope: "app"`) — this sidebar only
 * exists in the agent-manager app, so the choice is a single global value.
 */
export const conversationsSidebarRegion =
  defineVariantRegion<ConversationSidebarProps>({
    id: "conversations-sidebar",
    label: "Conversation list",
    defaultVariant: "classic",
  });
