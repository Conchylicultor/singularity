import type {
  SecretMetadata,
  SecretRef,
} from "@plugins/infra/plugins/secrets/shared";
import { SecretsMainOfflineError } from "@plugins/infra/plugins/secrets/shared";

const GATEWAY_BASE = "http://localhost:9000";
const RETRY_DELAY_MS = 250;

interface GetResponse {
  value: string | null;
}
interface HasResponse {
  has: boolean;
}
interface ListResponse {
  keys: string[];
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const url = `${GATEWAY_BASE}${path}`;
  const init: RequestInit = {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch {
    // One retry, then surface as offline. Mirrors the previous unix-socket
    // client's behavior — "central is unreachable" is the failure mode that
    // matters; transient blips collapse into one retry.
    await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
    try {
      res = await fetch(url, init);
    } catch {
      throw new SecretsMainOfflineError();
    }
  }
  if (res.status === 502 || res.status === 503 || res.status === 504) {
    throw new SecretsMainOfflineError();
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`secrets api ${path}: ${res.status} ${text}`);
  }
  return (await res.json()) as T;
}

export async function getSecret(ref: SecretRef): Promise<string | undefined> {
  const { value } = await postJson<GetResponse>("/api/secrets/get", ref);
  return value ?? undefined;
}

export async function setSecret(ref: SecretRef, value: string): Promise<void> {
  await postJson<{ ok: true }>("/api/secrets/set", { ...ref, value });
}

export async function deleteSecret(ref: SecretRef): Promise<void> {
  await postJson<{ ok: true }>("/api/secrets/delete", ref);
}

export async function hasSecret(ref: SecretRef): Promise<boolean> {
  const { has } = await postJson<HasResponse>("/api/secrets/has", ref);
  return has;
}

export async function getSecretMetadata(
  ref: SecretRef,
): Promise<SecretMetadata> {
  return postJson<SecretMetadata>("/api/secrets/meta", ref);
}

export async function listKeysInNamespace(namespace: string): Promise<string[]> {
  const { keys } = await postJson<ListResponse>("/api/secrets/list", {
    namespace,
  });
  return keys;
}
