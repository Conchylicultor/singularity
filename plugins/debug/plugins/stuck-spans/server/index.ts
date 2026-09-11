import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { spanStuckKind } from "./internal/span-stuck-kind";
import {
  startStuckSpanWatchdog,
  stopStuckSpanWatchdog,
} from "./internal/watchdog";

export default {
  description:
    "Stuck-span watchdog: a 15 s interval on each backend's own event loop — deliberately NOT a scheduled job — that reads the runtime profiler's open entries and files a span-stuck report while an http / sub / loader / push / flush / cascade span is still running past its threshold (90 s — past the app pool's 60 s query deadline; http 120 s), once per span run, naming the deepest stuck span of a chain with its open ancestors and attaching one coherent-instant trace per tick. Catches the hang a completion-time slow-op report never can. duressExempt; job and bg spans are excluded.",
  contributions: [spanStuckKind],
  // A raw interval, started and stopped exactly like the queue-health
  // watchdog — see `internal/watchdog.ts` for why it must not be a `defineJob`.
  onReady: () => {
    startStuckSpanWatchdog();
  },
  onShutdown: () => {
    stopStuckSpanWatchdog();
  },
} satisfies ServerPluginDefinition;
