import { db } from "@plugins/database/server";
import { _pageBlocksAgentAuthors } from "./tables";

/**
 * Record that `conversationId` authored content in the agent-notes card
 * `blockId`. Idempotent: re-recording the same pair is a no-op, and the
 * idempotence is the composite primary key rather than a check this function
 * performs — so two conversations appending to one card concurrently cannot lose
 * each other's id (the read-modify-write an array column would need).
 *
 * It records provenance and NOTHING ELSE. It does not check that `blockId` names
 * an agent-notes card: what an agent is allowed to address is the write tool's
 * policy, enforced where the tool resolves the block, and duplicating it here
 * would be a second answer to drift from the first.
 *
 * **Call it after the block row is committed.** The `block_id` FK is the
 * precondition; stamping a card that does not exist yet raises a foreign-key
 * violation, loudly, rather than writing an orphan.
 */
export async function recordAgentNotesAuthor(
  blockId: string,
  conversationId: string,
): Promise<void> {
  await db
    .insert(_pageBlocksAgentAuthors)
    .values({ blockId, conversationId })
    .onConflictDoNothing();
}
