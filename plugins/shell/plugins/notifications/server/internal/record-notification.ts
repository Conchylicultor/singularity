import { sql } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { _notifications } from "./tables";
import type { NotificationVariant } from "../../shared/schema";

export interface RecordNotificationInput {
  type: string;
  title: string;
  description: string;
  variant: NotificationVariant;
  linkTo?: string | null;
  metadata?: Record<string, unknown> | null;
  /**
   * Quiet notification: keeps its variant color but is dimmed in the bell list,
   * excluded from the unread badge, and never pops a toast. Defaults to false.
   */
  muted?: boolean;
  /**
   * Deterministic key that collapses duplicate writes to a single row via a
   * UNIQUE index: a second write with the same key updates the existing row's
   * display fields (title/description/variant/linkTo/metadata/muted) in place
   * rather than inserting a new row — so a deduped notification always reflects
   * its latest state (e.g. a crash whose noise classification flipped between
   * occurrences). The row's identity, creation time, and read/dismissed state
   * are preserved, so dedup collapses recurrences into one row without
   * resurfacing or re-alerting. Null/undefined means "no dedup" — Postgres
   * treats NULLs as non-conflicting, so a normal insert always happens.
   *
   * Every dedup hit (regardless of re-surface policy) bumps the row's `count`
   * and `lastSeenAt`, so a collapsed notification still reads as "happened N
   * times, last seen <ago>".
   */
  dedupeKey?: string | null;
  /**
   * Re-arm policy for a recurring deduped notification. When set, a dedup hit on
   * a row that last surfaced more than `resurfaceAfterMs` ago re-surfaces it —
   * resets `read`/`dismissed` to false and bumps `createdAt` to now, so it floats
   * back to the top of the bell as a fresh unread alert. A hit inside that window
   * only coalesces (count/lastSeenAt bump, no re-alert). Omit for identity-dedup
   * (the default): recurrences collapse forever onto one row and never resurface.
   * Requires `dedupeKey` to have any effect.
   */
  resurfaceAfterMs?: number;
  /**
   * Optional explicit row id. When provided it is used as the PK instead of a
   * generated one — clients pass their own id so the self-echo suppression
   * (recentClientIds) can match the stored row. Server-side callers omit it.
   */
  id?: string;
}

export async function recordNotification(
  input: RecordNotificationInput,
): Promise<string> {
  const id =
    input.id ??
    `notif-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const dedupKey = input.dedupeKey ?? null;
  const now = new Date();
  // Re-surface gate: a dedup hit re-alerts only once its row has been quiet (not
  // re-surfaced) for longer than the policy window. `createdAt` doubles as the
  // "last surfaced at" marker (it's bumped to now on every re-surface), so the
  // window check is `createdAt < now - resurfaceAfterMs`. Without a policy the
  // CASE collapses to "keep current value" — i.e. never resurface.
  const resurfaced =
    input.resurfaceAfterMs != null
      ? sql`(${_notifications.createdAt} < ${new Date(now.getTime() - input.resurfaceAfterMs)})`
      : sql`false`;
  const inserted = await db
    .insert(_notifications)
    .values({
      id,
      type: input.type,
      title: input.title,
      description: input.description,
      variant: input.variant,
      linkTo: input.linkTo ?? null,
      metadata: input.metadata ?? null,
      muted: input.muted ?? false,
      dedupKey,
    })
    // null never conflicts, so a plain insert happens when no dedupeKey is set;
    // a colliding dedupeKey refreshes the existing row's display fields in place
    // (notably re-syncing `muted` to the producer's current classification) so a
    // deduped notification never drifts from its source, and always bumps
    // count/lastSeenAt. read/dismissed/createdAt re-surface only when the
    // resurface gate fires (recurring metric kinds); otherwise they're preserved
    // so identity-dedup recurrences collapse into one row without re-alerting.
    .onConflictDoUpdate({
      target: _notifications.dedupKey,
      set: {
        title: input.title,
        description: input.description,
        variant: input.variant,
        linkTo: input.linkTo ?? null,
        metadata: input.metadata ?? null,
        muted: input.muted ?? false,
        count: sql`${_notifications.count} + 1`,
        lastSeenAt: now,
        read: sql`CASE WHEN ${resurfaced} THEN false ELSE ${_notifications.read} END`,
        dismissed: sql`CASE WHEN ${resurfaced} THEN false ELSE ${_notifications.dismissed} END`,
        createdAt: sql`CASE WHEN ${resurfaced} THEN ${now} ELSE ${_notifications.createdAt} END`,
      },
    })
    .returning({ id: _notifications.id });
  // onConflictDoUpdate returns the row on both insert and update, so this is
  // populated whether the write was a fresh insert or a dedup hit.
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard, no noUncheckedIndexedAccess
  if (inserted[0]) {
    return inserted[0].id;
  }
  return id;
}
