import { createHash } from "node:crypto";
import {
  eventDateIdentityKey,
  type EventDate,
} from "@plugins/apps/plugins/events/plugins/event-date/core";
import {
  eventIdKind,
  type EventId,
  type ExtractedEvent,
} from "@plugins/apps/plugins/events/plugins/events-core/core";

// Event identity, derived HERE (in the engine) rather than per source type.
//
// `events` is unique on `(source_id, external_id)` and the engine upserts against
// it, so identity is exactly what makes re-extraction idempotent: run the same
// page twice and the second run must update the same rows, not duplicate them. A
// source type MAY supply a stable upstream id; an LLM extraction cannot, and
// leaving each type to invent its own fallback would make idempotence a
// per-provider discipline that one marketplace source type quietly gets wrong —
// at the cost of a duplicated list the user sees. Deriving it in one place makes
// it true by construction for every type, present and future.

/**
 * Field separator that cannot occur inside any of the hashed parts.
 *
 * Written as the `\0` ESCAPE, not as a raw NUL byte in the source: the raw byte
 * renders as a space in every editor, diff and file read, so a reader has no way
 * to see that `"a b"` and `"a\0b"` hash differently. Do not "normalize" it back —
 * the digest is pinned in `external-id.test.ts`.
 */
const SEP = "\0";

/**
 * The title as identity sees it: Unicode-normalized, case-folded, whitespace
 * collapsed. A venue re-typing `"Techno  Night"` as `"Techno Night"` — or
 * shouting it in caps — must not mint a second event.
 */
export function normalizeTitle(title: string): string {
  return title.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * The fallback identity for an extraction that carries no upstream id:
 * `sha256(sourceId + normalizedTitle + eventDateIdentityKey(date))`.
 *
 * The date half comes from `event-date` and is the load-bearing part:
 *
 * - a `once` date contributes the UTC **day** key of its instant. Day, not
 *   instant, because pages routinely re-publish the same party with the door
 *   time nudged by half an hour; UTC, not the host's zone, so the id does not
 *   depend on which machine ran the extraction. This is byte-identical to the
 *   pre-recurrence derivation, so every existing one-off row keeps its identity
 *   across the format change and no duplicate storm follows the deploy.
 * - a `recurring` date contributes its RULE signature, deliberately independent
 *   of the anchor. Next week's extraction reports a later anchor for the same
 *   series; hashing that anchor would mint a second row every week and bury the
 *   first as disappeared. One series is one row, however often it is re-read.
 *
 * Scoped by `sourceId` even though the unique index already is, so the value is
 * globally meaningful on its own (two sources listing the same festival stay
 * distinguishable in a log line or a debug query).
 *
 * Throws (via `eventDateIdentityKey`) on a date it cannot key — an
 * unrepresentable identity is a loud failure, never a silently-wrong id.
 * Callers reach this through `planEventWrites`, which re-validates the
 * extractor's output first.
 */
export function deriveExternalId(
  sourceId: string,
  title: string,
  date: EventDate,
): string {
  return createHash("sha256")
    .update(
      `${sourceId}${SEP}${normalizeTitle(title)}${SEP}${eventDateIdentityKey(date)}`,
    )
    .digest("hex");
}

/**
 * The identity of one extracted event: the source type's own id when it has a
 * stable one, else the derived hash. A blank/whitespace-only supplied id is
 * treated as absent — an extractor emitting `""` means "I have none", and
 * honouring it literally would collapse every event of that run onto one row.
 */
export function resolveExternalId(
  sourceId: string,
  event: ExtractedEvent,
): string {
  const supplied = event.externalId?.trim();
  if (supplied) return supplied;
  return deriveExternalId(sourceId, event.title, event.date);
}

/**
 * The `events.id` primary key, derived from the identity rather than random.
 *
 * The row's PK is never part of the upsert's conflict-path update (see
 * `upsertEvents`), so a random id would be harmless — but a derived one makes
 * the whole write plan a pure function of the extraction, which is what lets the
 * plan be unit-tested without a database and re-run byte-identically.
 */
export function deriveEventRowId(
  sourceId: string,
  externalId: string,
): EventId {
  const digest = createHash("sha256")
    .update(`${sourceId}${SEP}${externalId}`)
    .digest("hex");
  return eventIdKind.mint(digest.slice(0, 32));
}
