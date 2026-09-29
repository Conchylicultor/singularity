import { useMemo } from "react";
import { useLive } from "@plugins/network/plugins/live/web";
import {
  mapResource,
  type ResourceResult,
} from "@plugins/primitives/plugins/live-state/web";
import { jsonlEvents } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/core";
import { ConversationArtifacts } from "./slots";
import {
  collectArtifacts,
  type ConversationArtifactSet,
} from "./internal/collect";

/** What the conversation produced, as a read: loading, failed, or ready. */
export type ConversationArtifactsResult =
  ResourceResult<ConversationArtifactSet>;

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
 * answer is `loading` (and `error` if it cannot be read), so a surface shows
 * that instead of claiming the conversation produced nothing.
 */
export function useConversationArtifacts(
  convId: string,
): ConversationArtifactsResult {
  const kinds = ConversationArtifacts.Kind.useContributions();
  const events = useLive(jsonlEvents, { id: convId });
  return useMemo(
    () => mapResource(events, (data) => collectArtifacts(kinds, data)),
    [kinds, events],
  );
}
