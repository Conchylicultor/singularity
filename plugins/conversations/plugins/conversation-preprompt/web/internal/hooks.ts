import {
  usePointResource,
  type ResourceResult,
} from "@plugins/primitives/plugins/live-state/web";
import {
  conversationPrepromptsResource,
  type ConversationPreprompt,
} from "../../shared/schemas";

// One O(1) point sub for this conversation's preprompt snapshot — replaces the
// O(n) lookup over the whole-collection record. Called in the header chip and
// per-row in the sidebar list; the live-state keep-alive + sub-batch absorb the
// per-row sub churn. Settled `null` is determinate (no preprompt recorded);
// "not loaded yet" stays the pending arm, so it can never read as "none".
export function useConversationPreprompt(
  conversationId: string,
): ResourceResult<ConversationPreprompt | null> {
  return usePointResource(conversationPrepromptsResource, conversationId);
}
