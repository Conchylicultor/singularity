import { registrationCount, type SessionRow } from "./rows";

// What an event says about a session beyond its title, place and time.
//
// Two parts, in this order:
//
//  1. **The association's own prose** — `description_session` (what is happening
//     that day) and then `note_lieu` (what the venue is like). Both are plain
//     text a human typed; neither is HTML.
//  2. **One line of facts the tags do not carry** — how many people have signed
//     up, and who is hosting.
//
// The venue's ratings are deliberately NOT repeated here: `Silencieux`,
// `Convivial` and the rest are already tags on the event, and a description that
// restates its own tags is noise on every row.

/** Long enough for the longest note the association actually writes; a bound, not a style choice. */
const MAX_LENGTH = 1000;

/** Collapse the runs of spaces and blank lines a pasted note carries. */
function tidy(text: string): string {
  return text
    .replace(/[^\S\n]+/g, " ")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "")
    .join("\n");
}

/**
 * The comparable form of a note: letters and digits only.
 *
 * Used to spot the two notes saying the same thing, which is a live case — one
 * session's `note_lieu` and `description_session` are the same sentence, and
 * others differ only by a trailing space or a capital.
 */
function comparable(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}

/**
 * The association's prose, de-duplicated.
 *
 * When one note contains the other, only the longer survives — so the identical
 * pair prints once, and a note that merely elaborates on the other still prints
 * both.
 */
function prose(row: SessionRow): string[] {
  const parts = [row.description_session, row.note_lieu]
    .map((text) => (text === null ? "" : tidy(text)))
    .filter((text) => text !== "");

  const kept: string[] = [];
  for (const part of parts) {
    const key = comparable(part);
    if (key === "") continue;
    const contained = kept.findIndex(
      (other) =>
        comparable(other).includes(key) || key.includes(comparable(other)),
    );
    if (contained === -1) {
      kept.push(part);
      continue;
    }
    // Keep whichever says more, in the position the first one held.
    if (part.length > kept[contained]!.length) kept[contained] = part;
  }
  return kept;
}

/**
 * How many people are coming, when that is a fact rather than a shrug.
 *
 * A bare `0 signed up` on a session with no stated capacity says nothing at all
 * — it is the state every session starts in — so it is left out. A capacity
 * makes even zero worth printing, because it is the fullness that is being
 * reported.
 */
function attendance(row: SessionRow): string | undefined {
  const signedUp = registrationCount(row);
  if (signedUp === undefined) return undefined;
  if (row.max_participants !== null) {
    return `${signedUp} of ${row.max_participants} signed up`;
  }
  return signedUp > 0 ? `${signedUp} signed up` : undefined;
}

/**
 * The description for one session, or `undefined` when the association published
 * nothing worth printing — which is the common case for a session with no note,
 * no host and nobody signed up yet.
 */
export function sessionDescription(row: SessionRow): string | undefined {
  const facts = [
    attendance(row),
    row.referent_name === null || row.referent_name.trim() === ""
      ? undefined
      : `Host: ${row.referent_name.trim()}`,
  ].filter((fact): fact is string => fact !== undefined);

  const blocks = [...prose(row)];
  if (facts.length > 0) blocks.push(facts.join(" · "));
  if (blocks.length === 0) return undefined;

  const text = blocks.join("\n");
  return text.length <= MAX_LENGTH ? text : `${text.slice(0, MAX_LENGTH)}…`;
}
