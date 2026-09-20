import {
  mergeHits,
  type ArtifactHit,
  type ArtifactItem,
} from "@plugins/conversations/plugins/conversation-view/plugins/artifacts/core";
import type { JsonlEvent } from "@plugins/conversations/plugins/transcript-watcher/core";

/** The fields of a registered kind that the extraction pass needs. */
export interface KindExtractor {
  id: string;
  /** Whether this kind's items add to the count — see `ArtifactKind.origin`. */
  origin: "produced" | "consumed";
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
      /** Every artifact, across every kind — what the panel lists. */
      total: number;
      /**
       * Artifacts of `"produced"` kinds only — the number on the button.
       *
       * Lower than `total` whenever the conversation looked at things it did
       * not make, and `0` for one that only looked: the panel still has
       * something to show, so the two are asked separately.
       */
      count: number;
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

  const produced = new Set(
    kinds.filter((kind) => kind.origin === "produced").map((kind) => kind.id),
  );
  const byKind = mergeHits(hits);
  let total = 0;
  let count = 0;
  for (const [id, items] of byKind) {
    total += items.length;
    if (produced.has(id)) count += items.length;
  }
  return { pending: false, byKind, total, count };
}
