import { createChannel } from "./registry";
import type { LogChannel, LogStream } from "./registry";

export type { LogChannel, LogStream };

export const Log = {
  channel(id: string): LogChannel {
    return createChannel(id);
  },
};
