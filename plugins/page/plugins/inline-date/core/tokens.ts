// Inline date mentions and reminders are stored as tokens inside a block's plain
// `data.text` string (no schema change), mirroring inline page links. Two kinds:
//
//   [[date:<iso>]]              — a visual date-reference chip
//   [[reminder:<id>:<iso>]]     — a date chip that also schedules a notification
//
// `<iso>` is a frozen UTC instant (e.g. `2026-06-17T09:00:00.000Z`) resolved by
// chrono at insertion time, so relative phrasing like "tomorrow" becomes concrete.
// `<id>` is a stable UUID — the durable identity the server reminder reconciler
// keys scheduling on. This is the single source of truth for the token format,
// shared by the web inline node and the server reminder reconciler.

const ISO = "[0-9TZ:.+-]+";
const UUID = "[a-f0-9-]+";

/**
 * Non-global pattern matching one inline mention token (date OR reminder) within
 * a single line. Group 1 = date iso (date kind); groups 2,3 = reminder id + iso
 * (reminder kind). Exactly one of the two alternatives matches per token.
 */
export const MENTION_TOKEN_PATTERN = new RegExp(
  `\\[\\[(?:date:(${ISO})|reminder:(${UUID}):(${ISO}))\\]\\]`,
);

/** Non-global pattern matching one reminder token; group 1 = id, group 2 = iso. */
export const REMINDER_TOKEN_PATTERN = new RegExp(
  `\\[\\[reminder:(${UUID}):(${ISO})\\]\\]`,
);

/** Serialize a date mention to its inline token. */
export function dateToken(iso: string): string {
  return `[[date:${iso}]]`;
}

/** Serialize a reminder mention to its inline token. */
export function reminderToken(id: string, iso: string): string {
  return `[[reminder:${id}:${iso}]]`;
}

/** Extract every reminder `{ id, iso }` from a block's text (in document order). */
export function scanReminderTokens(text: string): { id: string; iso: string }[] {
  const re = new RegExp(REMINDER_TOKEN_PATTERN.source, "g");
  const out: { id: string; iso: string }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) out.push({ id: m[1]!, iso: m[2]! });
  return out;
}

/** Strip every inline `[[…]]` token from text, leaving a clean human snippet. */
export function stripInlineTokens(text: string): string {
  return text.replace(/\[\[[^\]]*\]\]/g, "").replace(/\s+/g, " ").trim();
}
