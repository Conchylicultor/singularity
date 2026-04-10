import { createChannel } from "./internal/registry";
import type { LogChannel, LogStream } from "./internal/registry";

export type { LogChannel, LogStream };

export const Log = {
  channel(id: string): LogChannel {
    return createChannel(id);
  },
};
