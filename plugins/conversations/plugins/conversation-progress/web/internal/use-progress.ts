import { usePointResource } from "@plugins/primitives/plugins/live-state/web";
import { conversationProgressResource } from "../../shared/schemas";
import type { ConversationProgress } from "../../shared/schemas";

// One O(1) point sub for this conversation's progress row — replaces the O(n)
// `.find` over the whole-collection resource. `null` on the settled arm is
// determinate (no progress classified yet); pending also reads as `null` so the
// progress bar renders nothing until the one post-mount round-trip lands.
export function useProgressFor(conversationId: string): ConversationProgress | null {
  const result = usePointResource(conversationProgressResource, conversationId);
  return result.pending ? null : (result.data ?? null);
}
