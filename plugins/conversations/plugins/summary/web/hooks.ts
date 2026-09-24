import { useMemo } from "react";
import {
  mapResource,
  useResource,
  type ResourceResult,
} from "@plugins/primitives/plugins/live-state/web";
import {
  conversationSummariesResource,
  type ConversationSummary,
} from "../core";

/**
 * The conversation's most recent summary. Settled `null` means it was never
 * summarised; "not loaded yet" stays the pending arm, so a summarised
 * conversation can never read as "No summary yet" during the load window.
 *
 * Picks the max `generatedAt` explicitly rather than trusting `[0]`: the full
 * load is latest-first, but a scoped upsert (a new summary arriving) appends.
 */
export function useLatestConversationSummary(
  conversationId: string,
): ResourceResult<ConversationSummary | null> {
  const params = useMemo(() => ({ conversationId }), [conversationId]);
  const result = useResource(conversationSummariesResource, params);
  return mapResource(result, latestOf);
}

function latestOf(rows: ConversationSummary[]): ConversationSummary | null {
  let latest: ConversationSummary | null = null;
  for (const row of rows) {
    if (!latest || row.generatedAt > latest.generatedAt) latest = row;
  }
  return latest;
}
