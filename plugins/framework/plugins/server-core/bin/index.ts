import {
  profilerStart,
  recordMemoryCheckpoint,
  notificationsWsHandler,
  handleResourceHttp,
  collectContributions,
  reportServerError,
  markServerReady,
} from "@plugins/framework/plugins/server-core/core";
import type { WsData, HttpHandler, WsHandler, ServerPluginDefinition, LoadedServerPlugin } from "@plugins/framework/plugins/server-core/core";
import { asPluginId } from "@plugins/framework/plugins/plugin-id/core";
// The registry import goes through the `@composition-server-registry` alias
// (declared in tsconfig.base.json → `bin/plugins-active`). In dev this resolves
// to `plugins-active.ts`, whose existsSync selector picks full vs. filtered at
// runtime — identical behavior to a direct relative import. At release-compile
// time, `release.ts` overrides this alias to resolve STATICALLY to the filtered
// `core/server.composition.generated.ts`, so the bundler's closure IS the
// composition closure (no runtime dynamic specifier to defeat `bun --compile`).
import { serverEntries } from "@composition-server-registry";
import { boostInteractiveQos } from "@plugins/packages/plugins/spawn-priority/server";
import { isMain } from "@plugins/infra/plugins/paths/core";
import { topoSortPlugins } from "./topo";

// ── QoS boost (main backend only) ───────────────────────────────
// Raise the event-loop thread to user-interactive QoS BEFORE any boot work, so
// both boot and serving latency sit above default-priority bulk load (agent
// builds / type-check fleets) — the same scheduler tier that keeps GUI apps
// responsive during a build storm. STRICTLY main-only: isMain() is true only
// when the gateway spawned this backend with SINGULARITY_WORKTREE=singularity;
// an agent-worktree backend runs this same code under its own worktree name
// and never qualifies. Boosting agent backends would lift the fleet above its
// own builds and defeat priority isolation. See
// research/perfs/2026-07-08-host-saturation-agent-checks-starve-main.md.
if (isMain() && boostInteractiveQos()) {
  console.log("[boot] main backend event-loop thread raised to user-interactive QoS");
}

// ── Per-phase RSS attribution (boot Gantt) ──────────────────────
// We record a memory checkpoint at each clean boot-phase boundary below.
// CAVEAT: onReadyBlocking and onReady run their plugins under Promise.all, so
// the per-plugin (per-span) RSS deltas inside those phases overlap and are only
// *directional*. The phase-boundary checkpoints recorded here are the
// authoritative per-phase RSS numbers.
recordMemoryCheckpoint("boot-start");

// ── Load all server plugins ────────────────────────────────────
const loadResults = await Promise.allSettled(
  serverEntries.map((e) => e.loader() as Promise<{ default: ServerPluginDefinition }>),
);
const byPath = new Map<string, LoadedServerPlugin>();
const seenIds = new Set<string>();
for (let i = 0; i < loadResults.length; i++) {
  const r = loadResults[i]!;
  const e = serverEntries[i]!;
  if (r.status === "rejected") {
    console.error(`[plugin.${e.pluginPath}] load failed`, r.reason);
    continue;
  }
  // `id` is derived from the unique hierarchy path, never authored. The guard
  // is structurally unreachable but fails loud if codegen ever produces a
  // collision, rather than letting topo sort silently drop a plugin.
  if (seenIds.has(e.id)) {
    throw new Error(
      `[plugin] duplicate derived plugin id "${e.id}" (${e.pluginPath})`,
    );
  }
  seenIds.add(e.id);
  const plugin = r.value.default as LoadedServerPlugin;
  plugin.id = asPluginId(e.id);
  byPath.set(e.pluginPath, plugin);
}
for (const e of serverEntries) {
  const plugin = byPath.get(e.pluginPath);
  if (!plugin) continue;
  plugin.dependsOn = e.dependsOn
    .map((p) => byPath.get(p))
    .filter((d): d is LoadedServerPlugin => d !== undefined);
}
const ordered = topoSortPlugins([...byPath.values()]);
recordMemoryCheckpoint("after-import");

// Phase 1 — register: sequential, topo-sorted. Each plugin's `register`
// array holds Registration tokens returned by helpers like `Mcp.tool`,
// `Runtime.define`, `defineJob`, `defineTriggerEvent`, and
// `UNSAFE_installDurableHooks`. This is the only place plugins write to
// global registries. A failure here is fatal: a half-initialized registry
// would let `onReady` run against an inconsistent world.
for (const p of ordered) {
  for (const r of p.register ?? []) {
    const end = profilerStart(`register:${p.id}`, "register", p.id, p.id);
    try {
      await r.register();
    } catch (err) {
      console.error(`[plugin.${p.id}] register failed`, err);
      throw err;
    } finally {
      end();
    }
  }
}

// ── Contributions ──────────────────────────────────────────────
// Collect declarative contributions from all plugins before onReady.
// Consuming plugins call Token.getContributions() in their onReady.
collectContributions(ordered);

// ── Route tables ────────────────────────────────────────────────
// Flatten plugin routes into lookup tables. Literal routes go in an O(1)
// map; routes with :param segments are matched linearly in registration
// order.
interface ParamRoute<H> {
  segments: Array<{ literal: string } | { param: string }>;
  handler: H;
}
interface HttpParamRoute extends ParamRoute<HttpHandler> {
  method: string;
}
const literalHttpRoutes: Record<string, HttpHandler> = {};
const paramHttpRoutes: HttpParamRoute[] = [];
const wsRoutes: Record<string, WsHandler> = {};

function pathSegments(path: string): Array<{ literal: string } | { param: string }> {
  return path
    .split("/")
    .filter((s) => s.length > 0)
    .map((s) => (s.startsWith(":") ? { param: s.slice(1) } : { literal: s }));
}

function registerHttpRoute(key: string, handler: HttpHandler) {
  const spaceIdx = key.indexOf(" ");
  const method = key.slice(0, spaceIdx);
  const path = key.slice(spaceIdx + 1);
  if (!path.includes("/:")) {
    literalHttpRoutes[`${method} ${path}`] = handler;
    return;
  }
  paramHttpRoutes.push({ method, segments: pathSegments(path), handler });
}

function matchSegments<H>(
  pathname: string,
  routes: ParamRoute<H>[],
  filter: (r: ParamRoute<H>) => boolean = () => true,
): { handler: H; params: Record<string, string> } | null {
  const parts = pathname.split("/").filter((s) => s.length > 0);
  for (const route of routes) {
    if (!filter(route)) continue;
    if (route.segments.length !== parts.length) continue;
    const params: Record<string, string> = {};
    let ok = true;
    for (let i = 0; i < route.segments.length; i++) {
      const seg = route.segments[i]!;
      const part = parts[i]!;
      if ("literal" in seg) {
        if (seg.literal !== part) {
          ok = false;
          break;
        }
      } else {
        params[seg.param] = decodeURIComponent(part);
      }
    }
    if (ok) return { handler: route.handler, params };
  }
  return null;
}

{
  const end = profilerStart("routePopulation", "routePopulation", "Route Population");
  for (const plugin of ordered) {
    if (plugin.httpRoutes) {
      for (const [key, handler] of Object.entries(plugin.httpRoutes)) {
        registerHttpRoute(key, handler);
      }
    }
    if (plugin.wsRoutes) Object.assign(wsRoutes, plugin.wsRoutes);
  }
  end();
}

// Core-owned routes for the live-state primitive.
wsRoutes["/ws/notifications"] = notificationsWsHandler;
registerHttpRoute("GET /api/resources/:key", handleResourceHttp);

// ── Bind socket ─────────────────────────────────────────────────
// Bind immediately after migrations so the gateway detects readiness and
// starts proxying. onReady hooks run background work (graphile-worker DDL,
// git-log reconcile, file watchers, trigger setup) that isn't needed for
// serving HTTP/WS. Without this, the frontend loads instantly (static files)
// but stays stuck on "Server: Reconnecting" for the entire onReady phase.
const socketPath = Bun.env.SOCKET_PATH;
if (!socketPath) throw new Error("SOCKET_PATH env var is required");

async function safeHandle(
  handler: HttpHandler,
  req: Request,
  params: Record<string, string>,
  pathname: string,
): Promise<Response> {
  try {
    return await handler(req, params);
  } catch (err) {
    const errObj = err instanceof Error ? err : new Error(String(err));
    // Fail loudly: always emit a durable log line (captured by the gateway into
    // the per-worktree backend log) BEFORE returning a generic 500. The crash
    // report below is DB-backed and deduped — and is silently dropped during the
    // boot window before the reports plugin registers its reporter — so it can't
    // be the only signal. A 500 with zero log line made this class of bug
    // invisible.
    console.error(`[http] ${req.method} ${pathname}: ${errObj.message}`, errObj.stack ?? "");
    reportServerError({
      message: `[http] ${req.method} ${pathname}: ${errObj.message}`,
      stack: errObj.stack ?? null,
      errorType: errObj.name,
    });
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}

const endSocketBind = profilerStart("socketBind", "socketBind", "Socket Bind");
Bun.serve<WsData>({
  unix: socketPath,
  // Was Bun's default 10s. Under a host-saturation event-loop stall, an in-flight
  // HTTP handler or a WS-upgrade attempt writes no bytes for >10s and Bun drops it,
  // triggering a reconnect/resubscribe storm that amplifies the stall. This is a
  // gateway-fronted unix-socket-only listener, so 60s still reaps genuinely dead
  // HTTP conns within a minute while sitting above the gateway's load-scaled
  // readiness timeout. (The live WS is separately governed by the unset,
  // 120s-default websocket.idleTimeout — not this key.)
  idleTimeout: 60,
  fetch(req, server) {
    const url = new URL(req.url);

    // WebSocket upgrade
    if (req.headers.get("upgrade") === "websocket") {
      const handler = wsRoutes[url.pathname];
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard, no noUncheckedIndexedAccess
      if (handler) {
        server.upgrade(req, { data: { path: url.pathname } });
        return;
      }
    }

    // HTTP routing: literal fast-path, then :param matcher.
    const literal = literalHttpRoutes[`${req.method} ${url.pathname}`];
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard, no noUncheckedIndexedAccess
    if (literal) return safeHandle(literal, req, {}, url.pathname);

    const matched = matchSegments(
      url.pathname,
      paramHttpRoutes,
      (r) => (r as HttpParamRoute).method === req.method,
    );
    if (matched) return safeHandle(matched.handler, req, matched.params, url.pathname);

    return new Response("Not found", { status: 404 });
  },
  websocket: {
    open(ws) {
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard, no noUncheckedIndexedAccess
      wsRoutes[ws.data.path]?.open(ws);
    },
    message(ws, msg) {
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard, no noUncheckedIndexedAccess
      wsRoutes[ws.data.path]?.message(ws, msg);
    },
    close(ws, code, reason) {
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard, no noUncheckedIndexedAccess
      wsRoutes[ws.data.path]?.close(ws, code, reason);
    },
  },
});

endSocketBind();
console.log(`Server listening on ${socketPath}`);

// Run a lifecycle phase graph-driven by `dependsOn`: each plugin's `hook` starts
// only after all its `dependsOn` parents' hooks have resolved. `topoSortPlugins`
// guarantees every plugin appears after its deps in `ordered`, so
// `resolved.get(d.id)` is always defined when we reach a dependent. The per-plugin
// try/catch lives INSIDE the `.then` callback so one plugin's outcome propagates
// (or doesn't) to the final `Promise.all` per the phase's fatality contract below.
//
// Fatality differs by phase, because the two phases sit on opposite sides of the
// readiness flip:
//
// - `onReadyBlocking` is the HARD BARRIER *before* the backend serves. Its entire
//   contract is "this MUST finish before requests can be served correctly" — so a
//   throw means it did NOT finish, and boot MUST abort, for EVERY plugin regardless
//   of the plugin-wide `loadBearing` flag. `loadBearing` classifies docs detail /
//   criticality, not barrier participation; gating the barrier on it silently
//   promoted a degraded backend (a change-feed with no triggers, an empty config
//   registry) behind a green `/api/health/ready`. A plugin whose blocking work is
//   genuinely optional-for-correctness must make that explicit by handling its own
//   failure INSIDE the hook (see `live-state-snapshot`), never by relying on the
//   framework to swallow it.
// - `onReady` runs AFTER the server is already serving. Killing a live, serving
//   backend because a background poller/watcher threw is reserved for genuinely
//   critical plugins, so that phase stays gated on `loadBearing`.
async function runGraphPhase(
  ordered: LoadedServerPlugin[],
  hook: "onReadyBlocking" | "onReady",
): Promise<void> {
  const resolved = new Map<string, Promise<void>>();
  for (const p of ordered) {
    const deps = (p.dependsOn ?? []).map((d) => resolved.get(d.id)!);
    const ready = Promise.all(deps).then(async () => {
      const fn = p[hook];
      if (!fn) return;
      const end = profilerStart(`${hook}:${p.id}`, hook, p.id, p.id);
      try {
        await fn.call(p);
      } catch (err) {
        console.error(`[plugin.${p.id}] ${hook} failed`, err);
        if (hook === "onReadyBlocking" || p.loadBearing) throw err;
      } finally {
        end();
      }
    });
    resolved.set(p.id, ready);
  }
  await Promise.all(resolved.values());
}

// ── onReadyBlocking ─────────────────────────────────────────────
// Hard barrier between socket-bind and serving-ready. Plugins that MUST finish
// before the backend can correctly serve requests (DB migrations + pool warm,
// config registry init) run here. The phase is graph-driven by `dependsOn`
// (exactly like `onReady` below): each plugin's blocking hook starts only after
// all its `dependsOn` parents' blocking hooks have resolved, so DB-touching
// plugins auto-sequence after `database`'s migrations. Once the whole phase
// resolves we flip the readiness flag — `GET /api/health/ready` returns 200 only
// after this point, and the gateway gates its hot-swap on that probe (so the old
// backend keeps serving until the new one is genuinely ready). Background
// `onReady` work runs after, now guaranteed to observe a migrated DB and a ready
// registry. ANY plugin's rejection here aborts boot — this is a hard barrier, so
// its fatality is NOT gated on `loadBearing` (a plugin with optional blocking work
// handles its own failure inside the hook). See `runGraphPhase`.
{
  const end = profilerStart("onReadyBlocking", "onReadyBlocking", "Blocking Ready");
  try {
    await runGraphPhase(ordered, "onReadyBlocking");
  } finally {
    end();
  }
}
recordMemoryCheckpoint("after-onReadyBlocking");
markServerReady();

// ── onReady ─────────────────────────────────────────────────────
// Phase 2 — onReady: eager graph-driven. Each plugin fires as soon as all
// its `dependsOn` parents have resolved — no artificial layer barriers.
// Plugins with no dependencies start immediately. `topoSortPlugins`
// guarantees every plugin appears after its deps in `ordered`, so
// `resolved.get(d.id)` is always defined when we reach a dependent.
await runGraphPhase(ordered, "onReady");
recordMemoryCheckpoint("after-onReady");

// ── onAllReady ──────────────────────────────────────────────────
// Phase 3 — full barrier: every plugin's `onReady` has resolved. Plugins whose
// initialization must observe another plugin's onReady-produced state (without
// a dependsOn edge — e.g. a schedule whose definition reads config) run here.
// Parallel; a load-bearing plugin's rejection aborts boot.
await Promise.all(
  ordered.map(async (p) => {
    if (!p.onAllReady) return;
    const end = profilerStart(`onAllReady:${p.id}`, "onAllReady", p.id, p.id);
    try {
      await p.onAllReady();
    } catch (err) {
      console.error(`[plugin.${p.id}] onAllReady failed`, err);
      if (p.loadBearing) throw err;
    } finally {
      end();
    }
  }),
);
recordMemoryCheckpoint("after-onAllReady");

// Graceful shutdown: drain workers, flush state, release DB connections.
// Guarded against double-entry so both SIGTERM and a follow-up SIGINT can't
// run shutdown twice while the first pass is still draining.
let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[server] ${signal} received; shutting down`);
  await Promise.all(
    ordered.map((p) =>
      // eslint-disable-next-line promise-safety/no-bare-catch
      Promise.resolve()
        .then(() => p.onShutdown?.())
        .catch((err) =>
          console.error(`[plugin.${p.id}] onShutdown failed`, err),
        ),
    ),
  );
  process.exit(0);
}
process.on("SIGTERM", () => { void shutdown("SIGTERM"); });
process.on("SIGINT", () => { void shutdown("SIGINT"); });

// Exit when orphaned (parent gateway died and we were reparented to init).
// macOS has no PR_SET_PDEATHSIG equivalent, so poll. Without this, old
// backends survive gateway crashes, leak PTYs, and hold onto ports.
if (process.ppid !== 1) {
  setInterval(() => {
    if (process.ppid === 1) process.exit(0);
  }, 2000).unref();
}
