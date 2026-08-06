import { asc, count, eq, min } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { implement } from "@plugins/infra/plugins/endpoints/server";
import {
  listClaudeCliCallsFor,
  type ClaudeCliCallsResult,
} from "../../core/endpoints";
import { _claudeCliCalls } from "./tables";
import { RECENT_CALLS_LIMIT } from "./resources";
import { statusForNoCalls } from "./retention-verdict";

/**
 * Every `claude --print` call recorded for one domain record, oldest first — a
 * record's calls read as a sequence (retry after retry), not a newest-first feed.
 *
 * The interesting case is the empty one: the log is a global ring, so "no rows
 * for this id" means either "never called" or "called, then trimmed". That
 * decision is `statusForNoCalls` — pure, and tested there.
 */
export async function listCallsFor(
  correlationId: string,
  occurredAt: Date | undefined,
): Promise<ClaudeCliCallsResult> {
  const calls = await db
    .select()
    .from(_claudeCliCalls)
    .where(eq(_claudeCliCalls.correlationId, correlationId))
    .orderBy(asc(_claudeCliCalls.createdAt));
  if (calls.length > 0) return { status: "calls", calls };

  // The capacity + horizon probe is only paid for on the empty path; with rows
  // in hand the answer is already known.
  const [agg] = await db
    .select({ total: count(), oldest: min(_claudeCliCalls.createdAt) })
    .from(_claudeCliCalls);
  const status = statusForNoCalls({
    occurredAt,
    total: agg?.total ?? 0,
    oldest: agg?.oldest ? new Date(agg.oldest) : null,
    limit: RECENT_CALLS_LIMIT,
  });
  if (status === "not-retained") return { status: "not-retained" };
  return { status: "none" };
}

export const handleListCallsFor = implement(
  listClaudeCliCallsFor,
  async ({ query }) => listCallsFor(query.correlationId, query.occurredAt),
);
