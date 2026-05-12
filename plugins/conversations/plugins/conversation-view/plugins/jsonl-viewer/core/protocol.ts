import { z } from "zod";
import { resourceDescriptor } from "@plugins/primitives/plugins/live-state/core";
import {
  JsonlEventSchema,
  type JsonlEvent,
} from "@plugins/conversations/plugins/transcript-watcher/core";

export const JsonlEventsPayloadSchema = z.array(JsonlEventSchema);

export interface JsonlEventsResponse {
  events: JsonlEvent[];
}

export const jsonlEventsResource = resourceDescriptor<JsonlEvent[], { id: string }>(
  "jsonl-events",
  JsonlEventsPayloadSchema,
  [],
);
