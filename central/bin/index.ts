import type { WsData, HttpHandler, WsHandler } from "./types";
import { plugins } from "./plugins";
import { notificationsWsHandler, handleResourceHttp } from "./resources";
import { topoSortPlugins } from "./topo";

// Phase 1 — register: sequential, topo-sorted. Each plugin's `register`
// array holds Registration tokens; the framework calls `.register()` on
// each in order. See server/src/index.ts for the same pattern.
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
