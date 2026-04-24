import { defineTriggerEvent } from "@plugins/events/server";

export interface PushLandedPayload {
  pushId: string;
  sha: string;
  attemptId: string;
  conversationId: string;
  [key: string]: unknown;
}

// No filter columns: all subscribers match every emit. Add filter slots here
// (e.g. attemptId, conversationId) if future consumers need scoped delivery.
export const { event: pushLanded, table: _pushLandedTriggers } =
  defineTriggerEvent<PushLandedPayload>({
    name: "pushes.landed",
    filters: {},
  });
