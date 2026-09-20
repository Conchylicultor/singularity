import { useMemo } from "react";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { jsonlEventsResource } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/core";
import { ConversationArtifacts } from "./slots";
import {
  collectArtifacts,
  type ConversationArtifactsResult,
} from "./internal/collect";

/**
 * Everything one conversation made, changed or looked at.
 *
 * No new server resource and no transcript re-scan: this joins the parsed-event
 * subscription the conversation view already holds open, and derives the
 * artifacts from it here. Every registered kind's `extract` runs over the whole
 * event array whenever that array changes — which is once per new turn, not on
 * every render.
 *
 * The result is a state, never a stand-in: until the transcript has arrived the
 * answer is `{ pending: true }`, so a surface shows a loading state instead of
 * claiming the conversation produced nothing.
 */
export function useConversationArtifacts(
  convId: string,
): ConversationArtifactsResult {
  const kinds = ConversationArtifacts.Kind.useContributions();
  const events = useResource(jsonlEventsResource, { id: convId });
  return useMemo(() => collectArtifacts(kinds, events), [kinds, events]);
}

export type { ConversationArtifactsResult };
