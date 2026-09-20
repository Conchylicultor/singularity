/**
 * What a conversation made, changed, or looked at.
 *
 * The vocabulary is deliberately tiny and runtime-free: both halves of the
 * feature speak it — the extractors (pure functions over transcript events) and
 * the sections that render the result — and a future kind adds nothing to it.
 */

/**
 * How the conversation touched the artifact.
 *
 * Ordered strongest-first: a conversation that read a doc and then rewrote it
 * has *edited* it, and that is the one thing its row should say. See
 * {@link strongestRelation}.
 */
export type Relation = "created" | "edited" | "referenced";

/** Strength order, strongest first. Index = rank, so a lower rank wins. */
const RELATION_RANK: readonly Relation[] = ["created", "edited", "referenced"];

/** Sentence-case label for a relation — the one spelling, shown in tooltips. */
export const RELATION_LABEL: Record<Relation, string> = {
  created: "Created",
  edited: "Edited",
  referenced: "Referenced",
};

/** The stronger of two relations (`created` > `edited` > `referenced`). */
export function strongestRelation(a: Relation, b: Relation): Relation {
  return RELATION_RANK.indexOf(a) <= RELATION_RANK.indexOf(b) ? a : b;
}

/**
 * One sighting of one artifact in one transcript event.
 *
 * `kind` is the id of the contributing kind — the same string as its
 * `ConversationArtifacts.Kind` contribution id. `key` identifies the artifact
 * WITHIN that kind (a prototype id, a page id, a file path), so `(kind, key)`
 * is the artifact's identity. `at` is the event's ISO-8601 instant.
 */
export interface ArtifactHit {
  kind: string;
  key: string;
  relation: Relation;
  at: string;
}

/**
 * One artifact, after every sighting of it has been folded together: the
 * strongest relation anyone reported, and the span of time it was seen over.
 *
 * No `kind` field — an item only ever exists inside its own kind's list.
 */
export interface ArtifactItem {
  key: string;
  relation: Relation;
  firstAt: string;
  lastAt: string;
}
