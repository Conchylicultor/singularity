import { chmodSync, existsSync, unlinkSync } from "node:fs";
import {
  RPC_PATHS,
  type DeleteRequest,
  type GetRequest,
  type HasRequest,
  type ListRequest,
  type MetaRequest,
  type SetRequest,
} from "./protocol";
import { SOCKET_PATH } from "../paths";
import {
  deleteLocal,
  getLocal,
  getMetadataLocal,
  hasLocal,
  listKeysLocal,
  setLocal,
} from "../store";

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

let started = false;

export function startUnixSocketServer(): void {
  if (started) return;
  if (existsSync(SOCKET_PATH)) {
    try { unlinkSync(SOCKET_PATH); } catch { /* ignore */ }
  }

  // biome-ignore lint/suspicious/noExplicitAny: Bun.serve unix variant typing.
  (Bun as any).serve({
    unix: SOCKET_PATH,
    async fetch(req: Request): Promise<Response> {
      const { pathname } = new URL(req.url);
      try {
        if (req.method === "POST" && pathname === RPC_PATHS.get) {
          const body = (await req.json()) as GetRequest;
          const value = getLocal(body.namespace, body.key);
          return jsonResponse({ value: value ?? null });
        }
        if (req.method === "POST" && pathname === RPC_PATHS.set) {
          const body = (await req.json()) as SetRequest;
          await setLocal(body.namespace, body.key, body.value);
          return jsonResponse({ ok: true });
        }
        if (req.method === "POST" && pathname === RPC_PATHS.delete) {
          const body = (await req.json()) as DeleteRequest;
          await deleteLocal(body.namespace, body.key);
          return jsonResponse({ ok: true });
        }
        if (req.method === "POST" && pathname === RPC_PATHS.has) {
          const body = (await req.json()) as HasRequest;
          return jsonResponse({ has: hasLocal(body.namespace, body.key) });
        }
        if (req.method === "POST" && pathname === RPC_PATHS.meta) {
          const body = (await req.json()) as MetaRequest;
          return jsonResponse(getMetadataLocal(body.namespace, body.key));
        }
        if (req.method === "POST" && pathname === RPC_PATHS.list) {
          const body = (await req.json()) as ListRequest;
          return jsonResponse({ keys: listKeysLocal(body.namespace) });
        }
        return new Response("not found", { status: 404 });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return jsonResponse({ ok: false, message }, 500);
      }
    },
  });

  try { chmodSync(SOCKET_PATH, 0o600); } catch { /* socket may not be ready */ }
  started = true;
}
