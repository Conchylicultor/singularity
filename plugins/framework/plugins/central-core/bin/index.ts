import type { WsData, HttpHandler, WsHandler, CentralPluginDefinition, LoadedCentralPlugin } from "@plugins/framework/plugins/central-core/core";
import { notificationsWsHandler, handleResourceHttp } from "@plugins/framework/plugins/central-core/core";
import { asPluginId } from "@plugins/framework/plugins/plugin-id/core";
import { centralEntries } from "../core/central.generated";
import { topoSortPlugins } from "./topo";

// ── Load all central plugins ───────────────────────────────────
const loadResults = await Promise.allSettled(
  centralEntries.map((e) => e.loader() as Promise<{ default: CentralPluginDefinition }>),
);
const byPath = new Map<string, LoadedCentralPlugin>();
const seenIds = new Set<string>();
for (let i = 0; i < loadResults.length; i++) {
  const r = loadResults[i]!;
  const e = centralEntries[i]!;
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
  const plugin = r.value.default as LoadedCentralPlugin;
  plugin.id = asPluginId(e.id);
  byPath.set(e.pluginPath, plugin);
}
for (const e of centralEntries) {
  const plugin = byPath.get(e.pluginPath);
  if (!plugin) continue;
  plugin.dependsOn = e.dependsOn
    .map((p) => byPath.get(p))
    .filter((d): d is LoadedCentralPlugin => d !== undefined);
}
const ordered = topoSortPlugins([...byPath.values()]);

// Phase 1 — register: sequential, topo-sorted. Each plugin's `register`
// array holds Registration tokens; the framework calls `.register()` on
// each in order. See server/src/index.ts for the same pattern.
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

await Promise.all(
  ordered.map((p) =>
    Promise.resolve()
      .then(() => p.onReady?.())
      .catch((err) => {
        console.error(`[plugin.${p.id}] onReady failed`, err);
        if (p.loadBearing) throw err;
      }),
  ),
);

let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[central] ${signal} received; shutting down`);
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

if (process.ppid !== 1) {
  setInterval(() => {
    if (process.ppid === 1) process.exit(0);
  }, 2000).unref();
}

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

function pathSegments(
  path: string,
): Array<{ literal: string } | { param: string }> {
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
}

// Core-owned routes for the live-state primitive on the central runtime.
// Browsers reach these paths via the gateway's central-routes manifest.
wsRoutes["/ws/central-notifications"] = notificationsWsHandler;
registerHttpRoute("GET /api/central-resources/:key", handleResourceHttp);

const socketPath = Bun.env.SOCKET_PATH;
if (!socketPath) throw new Error("SOCKET_PATH env var is required");

// Default every API response to `cache-control: no-store` unless the handler set
// its own — the dispatch-layer floor beneath handleResourceHttp's own explicit
// `no-store` that closes the cache-poisoning wedge class on central too (Fix E).
// Bun's constructed-Response headers are mutable in place (probed), so no clone.
function withDefaultCacheControl(res: Response): Response {
  if (!res.headers.has("cache-control")) res.headers.set("cache-control", "no-store");
  return res;
}

// Central had no try/catch around handler dispatch — a throw surfaced as Bun's
// default 500 with no log line. Mirror server-core's `safeHandle` (console.error
// with method + pathname + stack → generic 500); central has no reportServerError
// hook, so the console line is the parity floor. Also applies the Cache-Control
// default so both the success and error responses go through one chokepoint.
async function safeHandle(
  handler: HttpHandler,
  req: Request,
  params: Record<string, string>,
  pathname: string,
): Promise<Response> {
  try {
    return withDefaultCacheControl(await handler(req, params));
  } catch (err) {
    const errObj = err instanceof Error ? err : new Error(String(err));
    console.error(`[http] ${req.method} ${pathname}: ${errObj.message}`, errObj.stack ?? "");
    return withDefaultCacheControl(
      Response.json({ error: "Internal server error" }, { status: 500 }),
    );
  }
}

const server = Bun.serve<WsData>({
  unix: socketPath,
  fetch(req, server) {
    const url = new URL(req.url);

    if (req.headers.get("upgrade") === "websocket") {
      const handler = wsRoutes[url.pathname];
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard, no noUncheckedIndexedAccess
      if (handler) {
        server.upgrade(req, { data: { path: url.pathname } });
        return;
      }
    }

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

console.log(`Central listening on :${server.port}`);
