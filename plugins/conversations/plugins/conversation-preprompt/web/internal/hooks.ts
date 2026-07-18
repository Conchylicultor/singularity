import { usePointResource } from "@plugins/primitives/plugins/live-state/web";
import {
  conversationPrepromptsResource,
  type ConversationPreprompt,
} from "../../shared/schemas";

// One O(1) point sub for this conversation's preprompt snapshot — replaces the
// O(n) lookup over the whole-collection record. Called in the header chip and
// per-row in the sidebar list; the live-state keep-alive + sub-batch absorb the
// per-row sub churn. `null` on the settled arm is determinate (no preprompt
// recorded); pending also reads as `null` so the chip/icon stay unrendered
// until the one post-mount round-trip lands.
export function useConversationPreprompt(
  conversationId: string,
): ConversationPreprompt | null {
  const result = usePointResource(conversationPrepromptsResource, conversationId);
  if (result.pending) return null;
  return result.data ?? null;
}
