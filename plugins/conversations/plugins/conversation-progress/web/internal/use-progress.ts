import {
  usePointResource,
  type ResourceResult,
} from "@plugins/primitives/plugins/live-state/web";
import { conversationProgressResource } from "../../shared/schemas";
import type { ConversationProgress } from "../../shared/schemas";

// One O(1) point sub for this conversation's progress row — replaces the O(n)
// `.find` over the whole-collection resource. Settled `null` is determinate (no
// progress classified yet); "not loaded yet" stays the pending arm, so it can
// never read as "no progress".
export function useProgressFor(
  conversationId: string,
): ResourceResult<ConversationProgress | null> {
  return usePointResource(conversationProgressResource, conversationId);
}
