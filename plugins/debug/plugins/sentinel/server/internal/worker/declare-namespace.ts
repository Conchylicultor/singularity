import {
  declareRuntimeNamespace,
  readNamespaceArgv,
} from "@plugins/infra/plugins/runtime-identity/core";

// ── The FIRST thing the sentinel worker does: say which namespace it is ──────
//
// Imported as the literal first statement of `entry.ts`, before anything else —
// the worker thread's counterpart of `server-core/bin/declare-namespace.ts`.
//
// A worker thread evaluates its own module graph and shares no module state
// with the backend that spawned it, so it starts with no namespace declared.
// Parts of its import graph resolve paths from `runtimeNamespace()` at module
// eval, so the answer cannot wait for the `init` message: that arrives after the
// whole graph has already run. From 2026-09-15 to 2026-09-16 it did wait, the
// worker threw at load on every spawn, and main gave up after five tries — with
// the duress latch down the whole time.
//
// So the spawner passes it on the worker's ARGV (`worker-host.ts`:
// `new Worker(url, { argv: namespaceArgv() })`), which Bun exposes as this
// thread's `process.argv` before the first module evaluates. A compiled release
// spawns its vendored bundle the same way, and a bundle keeps import order.
//
// Design: research/2026-09-16-global-sentinel-worker-identity-and-loud-death.md

const fromArgv = readNamespaceArgv(process.argv);
if (fromArgv === undefined) {
  throw new Error(
    `[sentinel worker] spawned without --namespace <ns> in its argv. The ` +
      `spawner must pass it — \`new Worker(url, { argv: namespaceArgv() })\` ` +
      `(sentinel/server/internal/worker-host.ts) — because a worker thread ` +
      `shares no module state with its spawner and its imports resolve paths ` +
      `from the namespace as they load.`,
  );
}
declareRuntimeNamespace(fromArgv);
