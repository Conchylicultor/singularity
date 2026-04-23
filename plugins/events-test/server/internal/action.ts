import { z } from "zod";
import { defineAction } from "@plugins/events/server";
import type { PingedPayload } from "./tables";

// In-memory log for verification; cleared via the reset HTTP route.
// Not persisted — restarts wipe the log.
export interface LogEntry {
  label: string;
  payload: PingedPayload;
  triggerId: string;
  firedAt: string;
}

export const actionLog: LogEntry[] = [];

export const logPing = defineAction({
  name: "events_test.log",
  config: z.object({
    label: z.string(),
  }),
  run: ({ label }, ctx) => {
    actionLog.push({
      label,
      payload: ctx.payload as PingedPayload,
      triggerId: ctx.triggerId,
      firedAt: new Date().toISOString(),
    });
  },
});
