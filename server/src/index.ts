import type { WsData, HttpHandler, WsHandler } from "./types";
import { plugins } from "./plugins";

// Flatten plugin routes into lookup tables
const httpRoutes: Record<string, HttpHandler> = {};
const wsRoutes: Record<string, WsHandler> = {};

for (const plugin of plugins) {
  if (plugin.httpRoutes) Object.assign(httpRoutes, plugin.httpRoutes);
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

    // HTTP routing
    const route = httpRoutes[`${req.method} ${url.pathname}`];
    if (route) return route(req);

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
