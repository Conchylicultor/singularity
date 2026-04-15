import type { SseHandler } from "../../../../server/src/types";
import type { ConversationEvent } from "../../shared/protocol";
import { getSnapshot } from "./poller";

type Send = (data: ConversationEvent) => void;

const subscribers = new Set<Send>();

export function broadcast(event: ConversationEvent): void {
  for (const send of subscribers) {
    try {
      send(event);
    } catch {
      subscribers.delete(send);
    }
  }
}

export const conversationsStreamHandler: SseHandler<ConversationEvent> = {
  subscribe(send) {
    subscribers.add(send);
    for (const [id, info] of getSnapshot()) {
      send({ type: "working", id, working: info.working } satisfies ConversationEvent);
    }
    return () => {
      subscribers.delete(send);
    };
  },
};
