import {
  profilerStart,
  notificationsWsHandler,
  handleResourceHttp,
  collectContributions,
  reportServerError,
  markServerReady,
} from "@plugins/framework/plugins/server-core/core";
import type { WsData, HttpHandler, WsHandler, ServerPluginDefinition, LoadedServerPlugin } from "@plugins/framework/plugins/server-core/core";
import { serverEntries } from "../core/server.generated";
import { topoSortPlugins } from "./topo";

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
  if (seenIds.has(e.hierarchyPath)) {
    throw new Error(
      `[plugin] duplicate derived plugin id "${e.hierarchyPath}" (${e.pluginPath})`,
    );
  }
  seenIds.add(e.hierarchyPath);
  const plugin = r.value.default as LoadedServerPlugin;
  plugin.id = e.hierarchyPath;
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

// ── onReadyBlocking ─────────────────────────────────────────────
// Hard barrier between socket-bind and serving-ready. Plugins that MUST finish
// before the backend can correctly serve requests (DB migrations + pool warm,
// config registry init) run here. We await ALL of them, then flip the readiness
// flag — `GET /api/health/ready` returns 200 only after this point, and the
// gateway gates its hot-swap on that probe (so the old backend keeps serving
// until the new one is genuinely ready). Background `onReady` work runs after,
// now guaranteed to observe a migrated DB and a ready registry. Runs in
// parallel; a load-bearing plugin's rejection aborts boot (same contract as
// `onAllReady`).
{
  const end = profilerStart("onReadyBlocking", "onReadyBlocking", "Blocking Ready");
  try {
    await Promise.all(
      ordered.map(async (p) => {
        if (!p.onReadyBlocking) return;
        const pe = profilerStart(`onReadyBlocking:${p.id}`, "onReadyBlocking", p.id, p.id);
        try {
          await p.onReadyBlocking();
        } catch (err) {
          console.error(`[plugin.${p.id}] onReadyBlocking failed`, err);
          if (p.loadBearing) throw err;
        } finally {
          pe();
        }
      }),
    );
  } finally {
    end();
  }
}
markServerReady();

// ── onReady ─────────────────────────────────────────────────────
// Phase 2 — onReady: eager graph-driven. Each plugin fires as soon as all
// its `dependsOn` parents have resolved — no artificial layer barriers.
// Plugins with no dependencies start immediately. `topoSortPlugins`
// guarantees every plugin appears after its deps in `ordered`, so
// `resolved.get(d.id)` is always defined when we reach a dependent.
{
  const resolved = new Map<string, Promise<void>>();
  for (const p of ordered) {
    const deps = (p.dependsOn ?? []).map((d) => resolved.get(d.id)!);
    const ready = Promise.all(deps).then(async () => {
      if (p.onReady) {
        const end = profilerStart(`onReady:${p.id}`, "onReady", p.id, p.id);
        try {
          await p.onReady();
        } catch (err) {
          console.error(`[plugin.${p.id}] onReady failed`, err);
          if (p.loadBearing) throw err;
        } finally {
          end();
        }
      }
    });
    resolved.set(p.id, ready);
  }
  await Promise.all(resolved.values());
}

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
