import { SecretsMainOfflineError } from "@plugins/infra/plugins/secrets/shared";
import { SOCKET_PATH } from "../paths";
import {
  RPC_PATHS,
  type DeleteRequest,
  type DeleteResponse,
  type GetRequest,
  type GetResponse,
  type HasRequest,
  type HasResponse,
  type ListRequest,
  type ListResponse,
  type MetaRequest,
  type MetaResponse,
  type SetRequest,
  type SetResponse,
} from "./protocol";

const RETRY_DELAY_MS = 250;

async function unixFetch(
  path: string,
  init: RequestInit & { method?: string },
): Promise<Response> {
  // biome-ignore lint/suspicious/noExplicitAny: Bun-specific fetch option.
  return fetch(`http://main${path}`, { ...init, unix: SOCKET_PATH } as any);
}

async function unixFetchWithRetry(
  path: string,
  init: RequestInit & { method?: string },
): Promise<Response> {
  try {
    return await unixFetch(path, init);
  } catch {
    // Any fetch failure (socket missing, refused, cannot read) means main's
    // secrets server is unreachable. One quick retry, then surface as offline.
    await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
    try {
      return await unixFetch(path, init);
    } catch {
      throw new SecretsMainOfflineError();
    }
  }
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await unixFetchWithRetry(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`secrets socket: ${res.status} ${text}`);
  }
  return (await res.json()) as T;
}

export async function rpcGet(req: GetRequest): Promise<GetResponse> {
  return postJson<GetResponse>(RPC_PATHS.get, req);
}
export async function rpcSet(req: SetRequest): Promise<SetResponse> {
  return postJson<SetResponse>(RPC_PATHS.set, req);
}
export async function rpcDelete(req: DeleteRequest): Promise<DeleteResponse> {
  return postJson<DeleteResponse>(RPC_PATHS.delete, req);
}
export async function rpcHas(req: HasRequest): Promise<HasResponse> {
  return postJson<HasResponse>(RPC_PATHS.has, req);
}
export async function rpcMeta(req: MetaRequest): Promise<MetaResponse> {
  return postJson<MetaResponse>(RPC_PATHS.meta, req);
}
export async function rpcList(req: ListRequest): Promise<ListResponse> {
  return postJson<ListResponse>(RPC_PATHS.list, req);
}
