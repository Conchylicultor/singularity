import { defineExternalResource } from "@plugins/framework/plugins/server-core/core";
import { latencyLedgerRevisionResource as descriptor } from "../../core";

// The last minute written, as the tick the Stats card refetches on. In memory:
// after a restart it reads 0 until the first flush, and a fresh card load reads
// its summary over HTTP anyway.
let lastFlushedMinute = 0;

export const latencyLedgerRevisionServerResource = defineExternalResource(
  descriptor,
  {
    mode: "push",
    loader: () => Promise.resolve({ rev: lastFlushedMinute }),
  },
);

export function noteFlushedMinute(minuteStart: number): void {
  if (minuteStart <= lastFlushedMinute) return;
  lastFlushedMinute = minuteStart;
  latencyLedgerRevisionServerResource.notify();
}
