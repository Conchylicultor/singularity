import type { WsData, HttpHandler, WsHandler, SseHandler } from "./types";
import { plugins } from "./plugins";
import { runMigrations } from "./db/migrate";
import { ensureMainWorktreeRoot } from "@plugins/conversations/server/internal/worktree";

await runMigrations();
await ensureMainWorktreeRoot();

// Exit when orphaned (parent gateway died and we were reparented to init).
// macOS has no PR_SET_PDEATHSIG equivalent, so poll. Without this, old
// backends survive gateway crashes, leak PTYs, and hold onto ports.
if (process.ppid !== 1) {
  setInterval(() => {
    if (process.ppid === 1) process.exit(0);
  }, 2000).unref();
}

// Flatten plugin routes into lookup tables.
// Literal routes go in an O(1) map; routes with :param segments are matched
// linearly in registration order.
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
const literalSseRoutes: Record<string, SseHandler> = {};
const paramSseRoutes: ParamRoute<SseHandler>[] = [];

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

function registerSseRoute(path: string, handler: SseHandler) {
  if (!path.includes("/:")) {
    literalSseRoutes[path] = handler;
    return;
  }
  paramSseRoutes.push({ segments: pathSegments(path), handler });
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

function resolveSse(
  virtualUrl: string,
): { handler: SseHandler; params: Record<string, string> } | null {
  // virtualUrl is a path like "/api/conversations/stream" — no query string.
  const literal = literalSseRoutes[virtualUrl];
  if (literal) return { handler: literal, params: {} };
  return matchSegments(virtualUrl, paramSseRoutes);
}

for (const plugin of plugins) {
  if (plugin.httpRoutes) {
    for (const [key, handler] of Object.entries(plugin.httpRoutes)) {
      registerHttpRoute(key, handler);
    }
  }
  if (plugin.wsRoutes) Object.assign(wsRoutes, plugin.wsRoutes);
  if (plugin.sseRoutes) {
    for (const [path, handler] of Object.entries(plugin.sseRoutes)) {
      registerSseRoute(path, handler);
    }
  }
}

const encoder = new TextEncoder();
const PING = encoder.encode(": ping\n\n");
const HEARTBEAT_MS = 20_000;

// Escape SSE event name: must not contain newlines. Virtual URLs never do,
// but be defensive.
function escapeEventName(name: string): string {
  return name.replace(/[\r\n]/g, "");
}

function handleEvents(req: Request): Response {
  const url = new URL(req.url);
  const urlsParam = url.searchParams.get("urls") ?? "";
  const virtualUrls = urlsParam
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((s) => decodeURIComponent(s));

  let closed = false;
  const unsubs: Array<() => void> = [];
  let heartbeat: ReturnType<typeof setInterval> | null = null;

  const cleanup = () => {
    if (closed) return;
    closed = true;
    if (heartbeat) clearInterval(heartbeat);
    for (const u of unsubs) {
      try {
        u();
      } catch (err) {
        console.error("[sse] unsubscribe failed", err);
      }
    }
  };

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const enqueue = (bytes: Uint8Array) => {
        if (closed) return;
        try {
          controller.enqueue(bytes);
        } catch {
          cleanup();
        }
      };

      controller.enqueue(encoder.encode(": ok\n\n"));
      heartbeat = setInterval(() => enqueue(PING), HEARTBEAT_MS);

      for (const virtualUrl of virtualUrls) {
        const match = resolveSse(virtualUrl);
        if (!match) {
          controller.enqueue(
            encoder.encode(
              `event: ${escapeEventName(virtualUrl)}\ndata: {"error":"not-found"}\n\n`,
            ),
          );
          continue;
        }
        const name = escapeEventName(virtualUrl);
        const send = (data: unknown) => {
          enqueue(encoder.encode(`event: ${name}\ndata: ${JSON.stringify(data)}\n\n`));
        };
        try {
          unsubs.push(match.handler.subscribe(send, match.params));
        } catch (err) {
          console.error(`[sse] subscribe failed for ${virtualUrl}`, err);
        }
      }
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      "connection": "keep-alive",
    },
  });
}

const server = Bun.serve<WsData>({
  port: (() => {
    const p = Bun.env.PORT;
    if (!p) throw new Error("PORT env var is required");
    return parseInt(p, 10);
  })(),
  idleTimeout: 255,
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

    // Unified multiplexed SSE endpoint.
    if (req.method === "GET" && url.pathname === "/api/events") {
      return handleEvents(req);
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

console.log(`Server listening on :${server.port}`);
