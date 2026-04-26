import { chmodSync, existsSync, statSync, unlinkSync } from "node:fs";
import {
  RPC_PATHS,
  type ApiKeySetRequest,
  type DisconnectRequest,
  type StatusResponse,
  type TokenRequest,
  type TokenResponse,
} from "./protocol";
import { SOCKET_PATH } from "../paths";
import { getAccessTokenInternal } from "../token-access";
import { setApiKey, disconnectAccount } from "../actions";
import { computeAuthState } from "../auth-state";

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function handleToken(req: Request): Promise<Response> {
  const body = (await req.json()) as TokenRequest;
  const result = await getAccessTokenInternal({
    providerId: body.providerId,
    accountId: body.accountId,
    scopes: body.scopes,
  });
  const status: number = result.ok ? 200 : "needsConsent" in result ? 409 : 500;
  return jsonResponse(result satisfies TokenResponse, status);
}

async function handleDisconnect(req: Request): Promise<Response> {
  const body = (await req.json()) as DisconnectRequest;
  await disconnectAccount(body.providerId, body.accountId);
  return jsonResponse({ ok: true });
}

async function handleApiKey(req: Request): Promise<Response> {
  const body = (await req.json()) as ApiKeySetRequest;
  const identity = await setApiKey(body.providerId, body.apiKey);
  return jsonResponse({ ok: true, identity });
}

function handleStatus(): Response {
  const state: StatusResponse = computeAuthState();
  return jsonResponse(state);
}

let started = false;

export async function startUnixSocketServer(): Promise<void> {
  if (started) return;
  // Stale socket cleanup: if the file exists but no peer is bound, unlink it.
  if (existsSync(SOCKET_PATH)) {
    try {
      const s = statSync(SOCKET_PATH);
      if (s.isSocket()) {
        unlinkSync(SOCKET_PATH);
      } else {
        unlinkSync(SOCKET_PATH);
      }
    } catch {
      /* ignore */
    }
  }

  // Bun supports `unix` in Bun.serve.
  // biome-ignore lint/suspicious/noExplicitAny: Bun.serve unix variant typing.
  (Bun as any).serve({
    unix: SOCKET_PATH,
    async fetch(req: Request): Promise<Response> {
      const url = new URL(req.url);
      const path = url.pathname;
      try {
        if (req.method === "POST" && path === RPC_PATHS.token) {
          return await handleToken(req);
        }
        if (req.method === "POST" && path === RPC_PATHS.disconnect) {
          return await handleDisconnect(req);
        }
        if (req.method === "POST" && path === RPC_PATHS.apiKey) {
          return await handleApiKey(req);
        }
        if (req.method === "GET" && path === RPC_PATHS.status) {
          return handleStatus();
        }
        return new Response("not found", { status: 404 });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return jsonResponse({ ok: false, message }, 500);
      }
    },
  });

  try {
    chmodSync(SOCKET_PATH, 0o600);
  } catch {
    /* socket file may not be ready yet on some platforms */
  }
  started = true;
}
