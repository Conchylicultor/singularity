import { eq } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { _notifications } from "./tables";
import { notificationsResource } from "./resources";
import type { NotificationVariant } from "../../shared/schema";

export interface RecordNotificationInput {
  type: string;
  title: string;
  description: string;
  variant: NotificationVariant;
  linkTo?: string | null;
  metadata?: Record<string, unknown> | null;
  /**
   * Deterministic key that collapses duplicate writes to a single row via a
   * UNIQUE index. Null/undefined means "no dedup" — Postgres treats NULLs as
   * non-conflicting, so a normal insert always happens.
   */
  dedupeKey?: string | null;
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
      dedupKey,
    })
    // null never conflicts, so a normal insert happens when no dedupeKey is set.
    .onConflictDoNothing({ target: _notifications.dedupKey })
    .returning({ id: _notifications.id });
  // Cheap redundant nudge even on a pure conflict no-op.
  notificationsResource.notify();
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard, no noUncheckedIndexedAccess
  if (inserted[0]) {
    return inserted[0].id;
  }
  // Conflict: the row already existed. Look it up by dedupKey and return its id.
  if (dedupKey !== null) {
    const [existing] = await db
      .select({ id: _notifications.id })
      .from(_notifications)
      .where(eq(_notifications.dedupKey, dedupKey))
      .limit(1);
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard, no noUncheckedIndexedAccess
    if (existing) {
      return existing.id;
    }
  }
  // No insert and no existing row found — should be unreachable.
  return id;
}
