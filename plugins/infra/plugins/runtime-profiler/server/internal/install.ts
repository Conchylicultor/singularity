// Server-only: install an AsyncLocalStorage-backed ambient-context runtime into
// the (otherwise pure) recorder. This file lives under server/ and is never
// imported by the web bundle, so it may freely use node:async_hooks. Importing
// it (via the server barrel, which the plugin registry loads at boot) installs
// the runtime before Bun.serve starts handling requests.

import { AsyncLocalStorage } from "node:async_hooks";
import { installSpanContextRuntime, type SpanRef } from "../../core";

const als = new AsyncLocalStorage<SpanRef>();

installSpanContextRuntime({
  run: (ctx, fn) => als.run(ctx, fn),
  current: () => als.getStore(),
});
