import { ConversationChip } from "@plugins/conversations/plugins/conversation-ui/plugins/chip/web";
import { useConversationById } from "@plugins/conversations/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import type { PageReferenceChipProps } from "@plugins/page/plugins/page-reference/web";
import { useAgentNotesCreator } from "@plugins/page/plugins/annotations/plugins/agent-notes/plugins/authorship/web";

/** A chip-sized stand-in, for the two reads the chip waits on. */
function ChipLoading() {
  return <Loading variant="block" className="h-5 w-24" />;
}

/**
 * The conversation that CREATED an agent-authored page, as the chip at the
 * right edge of the page's row — clicking it opens that run beside the page.
 *
 * The creator is the page's FIRST authorship record: writes inside an agent
 * page stamp the page itself, and minting one stamps it as its own creator. A
 * page a human made with `/agent-page` has no record until an agent writes into
 * it, and shows no chip until then — that first writer then counts as the
 * creator.
 *
 * Two reads, and neither answers "nobody" for "not known yet": the authorship
 * record, then the conversation it names. Both wait as a chip-sized shimmer
 * (which paints only on a slow load). The second has one blind spot it inherits
 * from `useConversationById`, which answers `null` both while an older
 * conversation is being fetched and when it is gone for good — so a deleted
 * creator keeps the shimmer rather than claiming either.
 */
export function AgentPageCreatorChip({ pageId }: PageReferenceChipProps) {
  const creator = useAgentNotesCreator(pageId);
  if (creator.pending) return <ChipLoading />;
  if (creator.data === null) return null;
  return <CreatorChip conversationId={creator.data.conversationId} />;
}

/** The creator's chip, split out so the lookup hook only runs with an id. */
function CreatorChip({ conversationId }: { conversationId: string }) {
  const conv = useConversationById(conversationId);
  if (conv === null) return <ChipLoading />;
  return <ConversationChip conv={conv} />;
}
