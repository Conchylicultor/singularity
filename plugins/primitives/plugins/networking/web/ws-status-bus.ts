export type WsStatus = "connecting" | "open" | "reconnecting" | "closed";

export interface WsStatusEvent {
  url: string;
  status: WsStatus;
}

type Listener = (ev: WsStatusEvent) => void;

const listeners = new Set<Listener>();

export function publishWsStatus(ev: WsStatusEvent): void {
  for (const fn of listeners) fn(ev);
}

export function subscribeWsStatus(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
