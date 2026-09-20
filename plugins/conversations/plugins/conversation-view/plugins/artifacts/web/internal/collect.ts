import {
  mergeHits,
  type ArtifactHit,
  type ArtifactItem,
} from "@plugins/conversations/plugins/conversation-view/plugins/artifacts/core";
import type { JsonlEvent } from "@plugins/conversations/plugins/transcript-watcher/core";

/** The two fields of a registered kind that the extraction pass needs. */
export interface KindExtractor {
  id: string;
  extract: (event: JsonlEvent) => ArtifactHit[];
}

/**
 * What the conversation produced — or the fact that we do not know yet.
 *
 * Two arms, not a count that starts at zero: an artifact count is a claim about
 * the user's work, and a button that says "0" and then says "7" told them
 * something false for as long as the transcript took to arrive.
 */
export type ConversationArtifactsResult =
  | { pending: true }
  | {
      pending: false;
      /** Items per kind id. A kind that found nothing has no entry. */
      byKind: ReadonlyMap<string, ArtifactItem[]>;
      /** Every artifact, across every kind — what the button shows. */
      total: number;
    };

/** Events are read in transcript order, so hits arrive oldest-first. */
export function collectArtifacts(
  kinds: readonly KindExtractor[],
  events: { pending: true } | { pending: false; data: readonly JsonlEvent[] },
): ConversationArtifactsResult {
  if (events.pending) return { pending: true };

  const hits: ArtifactHit[] = [];
  for (const event of events.data) {
    for (const kind of kinds) {
      for (const hit of kind.extract(event)) {
        // A kind reporting under someone else's name would land its rows in a
        // section that never checked for them — silently, and only for the
        // events that hit that branch. Loud here, where the id is still in hand.
        if (hit.kind !== kind.id) {
          throw new Error(
            `[artifacts] kind "${kind.id}" emitted a hit for kind "${hit.kind}" ` +
              `(key "${hit.key}"). An extractor may only report its own kind.`,
          );
        }
        hits.push(hit);
      }
    }
  }

  const byKind = mergeHits(hits);
  let total = 0;
  for (const items of byKind.values()) total += items.length;
  return { pending: false, byKind, total };
}
