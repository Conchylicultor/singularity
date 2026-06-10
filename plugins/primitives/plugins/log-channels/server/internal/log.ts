import { createChannel, getOrCreateChannel } from "./registry";
import type { LogChannel, LogStream } from "./registry";

export type { LogChannel, LogStream };

export const Log = {
  channel(id: string, opts?: { persist?: boolean }): LogChannel {
    return opts?.persist ? getOrCreateChannel(id, { persist: true }) : createChannel(id);
  },
  emit(channelId: string, line: string, stream?: LogStream, t?: number): void {
    // Client ingress is always persisted — that's the whole point.
    getOrCreateChannel(channelId, { persist: true }).publish(line, stream, t);
  },
};
