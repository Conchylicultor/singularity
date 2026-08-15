import type { JsonlEvent } from "@plugins/conversations/plugins/transcript-watcher/core";

/**
 * The harness injects a `total_tokens_reminder` attachment repeatedly through a
 * session, each carrying one number wrapped in prose:
 * `<total_tokens>15000000 tokens left</total_tokens>`.
 *
 * As transcript ROWS these are pure noise — dozens of near-identical lines whose
 * number barely moves. As a status reading they are exactly what a reader wants,
 * so this plugin hides the rows and folds the whole series into one stat instead.
 */

export const TOTAL_TOKENS_SUBTYPE = "total_tokens_reminder";

/** A parsed reminder payload: either the number, or the text we could not read. */
export type ParsedBudget =
  { ok: true; remaining: number } | { ok: false; raw: string };

// Tolerates thousands separators and stray whitespace so a cosmetic change to
// the harness's wording degrades to "no reading" rather than a wrong number.
const REMAINING_RE =
  /<total_tokens>\s*([\d,_ ]*\d)\s*tokens left\s*<\/total_tokens>/i;

export function parseBudgetText(text: string): ParsedBudget {
  const match = REMAINING_RE.exec(text);
  if (!match?.[1]) return { ok: false, raw: text };
  const remaining = Number(match[1].replace(/[,_ ]/g, ""));
  if (!Number.isFinite(remaining)) return { ok: false, raw: text };
  return { ok: true, remaining };
}

/** Read a reminder attachment (typed `unknown` on the event) into a budget. */
export function parseBudgetAttachment(attachment: unknown): ParsedBudget {
  if (typeof attachment !== "object" || attachment === null) {
    return { ok: false, raw: String(attachment) };
  }
  const text = (attachment as { text?: unknown }).text;
  if (typeof text !== "string") return { ok: false, raw: String(attachment) };
  return parseBudgetText(text);
}

type AttachmentEvent = Extract<JsonlEvent, { kind: "attachment" }>;

export function isTotalTokensReminder(
  event: JsonlEvent,
): event is AttachmentEvent {
  return event.kind === "attachment" && event.subtype === TOTAL_TOKENS_SUBTYPE;
}

export interface BudgetStatus {
  /** What the last reading in this stretch said was left. */
  remaining: number;
  /**
   * The ceiling the share is measured against: the largest reading seen.
   * Derived rather than assumed, because a transcript chain can start mid-budget
   * and the harness never states the full budget anywhere.
   */
  budget: number;
  /** `remaining / budget`, 0..1. */
  share: number;
  /**
   * Everything the session has burned through here — the sum of the DROPS
   * between consecutive readings, not `first - last`. The two differ whenever
   * the budget is refreshed mid-transcript (a resumed chain, a new window),
   * which really happens; summing drops keeps the answer true across one.
   */
  spent: number;
}

/**
 * Fold every budget reminder in this stretch of transcript into one reading.
 * `null` when the stretch holds no readable reminder — nothing to report yet,
 * which the stat renders as nothing at all.
 */
export function readBudget(events: JsonlEvent[]): BudgetStatus | null {
  let remaining: number | null = null;
  let budget = 0;
  let spent = 0;

  for (const event of events) {
    if (!isTotalTokensReminder(event)) continue;
    const parsed = parseBudgetAttachment(event.attachment);
    if (!parsed.ok) continue;
    if (remaining !== null && parsed.remaining < remaining) {
      spent += remaining - parsed.remaining;
    }
    remaining = parsed.remaining;
    if (parsed.remaining > budget) budget = parsed.remaining;
  }

  if (remaining === null) return null;
  return {
    remaining,
    budget,
    // `budget >= remaining >= 0` by construction; a zero budget means the
    // harness reported zero left, which is a share of nothing — exhausted.
    share: budget > 0 ? remaining / budget : 0,
    spent,
  };
}
