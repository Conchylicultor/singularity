// Server-only: install an AsyncLocalStorage-backed ambient-context runtime into
// the (otherwise pure) recorder. This file lives under server/ and is never
// imported by the web bundle, so it may freely use node:async_hooks. Importing
// it (via the server barrel, which the plugin registry loads at boot) installs
// the runtime before Bun.serve starts handling requests.

import { AsyncLocalStorage } from "node:async_hooks";
import {
  installSpanContextRuntime,
  installProfilingSuppressionRuntime,
  type EntryContext,
} from "../../core";

// Stores the EntryContext by identity: AsyncLocalStorage preserves the same
// object reference across the entry's async continuation, so a gate awaited deep
// inside a loader mutates the very wait map `recordEntrySpan` later reads.
const als = new AsyncLocalStorage<EntryContext>();

installSpanContextRuntime({
  run: (ctx, fn) => als.run(ctx, fn),
  current: () => als.getStore(),
});

// Separate ALS for the profiling-suppression scope. Backs runWithoutProfiling so
// the observability subsystem's own DB writes (reports/slow-ops inserts) never
// re-enter the recorder. AsyncLocalStorage propagates `true` across the awaited
// DB work spawned synchronously inside the scope, so the connection-acquire and
// query spans recorded by the pool wrapper during the await are suppressed too.
const suppressAls = new AsyncLocalStorage<true>();

installProfilingSuppressionRuntime({
  run: (fn) => suppressAls.run(true, fn),
  suppressed: () => suppressAls.getStore() === true,
});
