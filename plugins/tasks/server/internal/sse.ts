import type { SseHandler } from "../../../../server/src/types";
import type { TasksEvent } from "../../shared/protocol";

type Send = (data: TasksEvent) => void;

const subscribers = new Set<Send>();

export function broadcastChanged(): void {
  for (const send of subscribers) {
    try {
      send({ type: "changed" });
    } catch {
      subscribers.delete(send);
    }
  }
}

export const tasksStreamHandler: SseHandler<TasksEvent> = {
  subscribe(send) {
    subscribers.add(send);
    return () => {
      subscribers.delete(send);
    };
  },
};
