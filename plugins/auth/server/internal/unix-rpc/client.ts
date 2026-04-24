import { AuthMainOfflineError } from "@plugins/auth/shared";
import { SOCKET_PATH } from "../paths";
import {
  RPC_PATHS,
  type ApiKeySetResponse,
  type DisconnectResponse,
  type StatusResponse,
  type TokenRequest,
  type TokenResponse,
} from "./protocol";

const RETRY_DELAY_MS = 250;

async function unixFetch(
  path: string,
  init: RequestInit & { method?: string },
): Promise<Response> {
  // Bun supports the `unix` option on fetch.
  // biome-ignore lint/suspicious/noExplicitAny: Bun-specific fetch option.
  return fetch(`http://main${path}`, { ...init, unix: SOCKET_PATH } as any);
}

async function unixFetchWithRetry(
  path: string,
  init: RequestInit & { method?: string },
): Promise<Response> {
  try {
    return await unixFetch(path, init);
  } catch (err) {
    const code = (err as { code?: string } | null)?.code;
    if (code === "ECONNREFUSED" || code === "ENOENT") {
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
      try {
        return await unixFetch(path, init);
      } catch {
        throw new AuthMainOfflineError();
      }
    }
    throw err;
  }
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await unixFetchWithRetry(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok && res.status !== 409) {
    const text = await res.text();
    throw new Error(`auth socket: ${res.status} ${text}`);
  }
  return (await res.json()) as T;
}

export async function rpcToken(req: TokenRequest): Promise<TokenResponse> {
  return postJson<TokenResponse>(RPC_PATHS.token, req);
}

export async function rpcDisconnect(req: {
  providerId: string;
  accountId?: string;
}): Promise<DisconnectResponse> {
  return postJson<DisconnectResponse>(RPC_PATHS.disconnect, req);
}

export async function rpcSetApiKey(req: {
  providerId: string;
  apiKey: string;
}): Promise<ApiKeySetResponse> {
  return postJson<ApiKeySetResponse>(RPC_PATHS.apiKey, req);
}

export async function rpcStatus(): Promise<StatusResponse> {
  const res = await unixFetchWithRetry(RPC_PATHS.status, { method: "GET" });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`auth socket: ${res.status} ${text}`);
  }
  return (await res.json()) as StatusResponse;
}
