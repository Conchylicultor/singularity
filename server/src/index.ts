import type { WsData, HttpHandler, WsHandler } from "./types";
import { plugins } from "./plugins";
import { runMigrations } from "./db/migrate";

await runMigrations();

// Flatten plugin routes into lookup tables.
// Literal routes go in an O(1) map; routes with :param segments are matched
// linearly in registration order.
interface ParamRoute {
  method: string;
  segments: Array<{ literal: string } | { param: string }>;
  handler: HttpHandler;
}
const literalHttpRoutes: Record<string, HttpHandler> = {};
const paramHttpRoutes: ParamRoute[] = [];
const wsRoutes: Record<string, WsHandler> = {};

function registerHttpRoute(key: string, handler: HttpHandler) {
  const spaceIdx = key.indexOf(" ");
  const method = key.slice(0, spaceIdx);
  const path = key.slice(spaceIdx + 1);
  if (!path.includes("/:")) {
    literalHttpRoutes[`${method} ${path}`] = handler;
    return;
  }
  const segments = path
    .split("/")
    .filter((s) => s.length > 0)
    .map((s) =>
      s.startsWith(":") ? { param: s.slice(1) } : { literal: s },
    );
  paramHttpRoutes.push({ method, segments, handler });
}

function matchParamRoute(
  method: string,
  pathname: string,
): { handler: HttpHandler; params: Record<string, string> } | null {
  const parts = pathname.split("/").filter((s) => s.length > 0);
  for (const route of paramHttpRoutes) {
    if (route.method !== method) continue;
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

for (const plugin of plugins) {
  if (plugin.httpRoutes) {
    for (const [key, handler] of Object.entries(plugin.httpRoutes)) {
      registerHttpRoute(key, handler);
    }
  }
  if (plugin.wsRoutes) Object.assign(wsRoutes, plugin.wsRoutes);
}

const server = Bun.serve<WsData>({
  port: (() => {
    const p = Bun.env.PORT;
    if (!p) throw new Error("PORT env var is required");
    return parseInt(p, 10);
  })(),
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

    const matched = matchParamRoute(req.method, url.pathname);
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

console.log(`Server listening on :${server.port}`);
