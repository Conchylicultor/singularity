import type { WsData, HttpHandler, WsHandler } from "./types";
import { plugins } from "./plugins";
import { awaitPgReady } from "./db/client";
import { runMigrations } from "./db/migrate";
import { notificationsWsHandler, handleResourceHttp } from "./resources";
import { topoSortPlugins } from "./topo";

// Phase 1 — register: sequential, topo-sorted. Each plugin's `register`
// array holds Registration tokens returned by helpers like `Mcp.tool`,
// `Runtime.define`, `defineJob`, `defineTriggerEvent`, and
// `UNSAFE_installDurableHooks`. This is the only place plugins write to
// global registries. A failure here is fatal: a half-initialized registry
// would let `onReady` run against an inconsistent world.
const ordered = topoSortPlugins(plugins);
for (const p of ordered) {
  for (const r of p.register ?? []) {
    try {
      await r.register();
    } catch (err) {
      console.error(`[plugin.${p.id}] register failed`, err);
      throw err;
    }
  }
}

await awaitPgReady();
await runMigrations();

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

for (const plugin of ordered) {
  if (plugin.httpRoutes) {
    for (const [key, handler] of Object.entries(plugin.httpRoutes)) {
      registerHttpRoute(key, handler);
    }
  }
  if (plugin.wsRoutes) Object.assign(wsRoutes, plugin.wsRoutes);
  // `plugin.resources` is just a declaration — defineResource() already
  // registered them in the global registry at import time. The field exists
  // for documentation / future introspection.
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

Bun.serve<WsData>({
  unix: socketPath,
  fetch(req, server) {
    const url = new URL(req.url);

    // WebSocket upgrade
    if (req.headers.get("upgrade") === "websocket") {
      const handler = wsRoutes[url.pathname];
      if (handler) {
        server.upgrade(req, { data: { path: url.pathname } });
        return;
      }
    }

    // HTTP routing: literal fast-path, then :param matcher.
    const literal = literalHttpRoutes[`${req.method} ${url.pathname}`];
    if (literal) return literal(req, {});

    const matched = matchSegments(
      url.pathname,
      paramHttpRoutes,
      (r) => (r as HttpParamRoute).method === req.method,
    );
    if (matched) return matched.handler(req, matched.params);

    return new Response("Not found", { status: 404 });
  },
  websocket: {
    open(ws) {
      wsRoutes[ws.data.path]?.open(ws);
    },
    message(ws, msg) {
      wsRoutes[ws.data.path]?.message(ws, msg);
    },
    close(ws, code, reason) {
      wsRoutes[ws.data.path]?.close(ws, code, reason);
    },
  },
});

console.log(`Server listening on ${socketPath}`);

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
        try {
          await p.onReady();
        } catch (err) {
          console.error(`[plugin.${p.id}] onReady failed`, err);
          if (p.loadBearing) throw err;
        }
      }
    });
    resolved.set(p.id, ready);
  }
  await Promise.all(resolved.values());
}

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
      Promise.resolve()
        .then(() => p.onShutdown?.())
        .catch((err) =>
          console.error(`[plugin.${p.id}] onShutdown failed`, err),
        ),
    ),
  );
  process.exit(0);
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

// Exit when orphaned (parent gateway died and we were reparented to init).
// macOS has no PR_SET_PDEATHSIG equivalent, so poll. Without this, old
// backends survive gateway crashes, leak PTYs, and hold onto ports.
if (process.ppid !== 1) {
  setInterval(() => {
    if (process.ppid === 1) process.exit(0);
  }, 2000).unref();
}
