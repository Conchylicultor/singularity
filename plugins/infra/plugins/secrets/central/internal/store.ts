import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { rename, writeFile, chmod, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { decrypt, encrypt } from "./crypto";
import { getEncryptionKey } from "./key-store";
import { SINGULARITY_DIR, STORE_PATH } from "./paths";
import type { SecretMetadata } from "@plugins/infra/plugins/secrets/shared";

interface Entry {
  value: string;
  updatedAt: number;
}

interface StoreBlob {
  version: 1;
  namespaces: Record<string, Record<string, Entry>>;
}

const EMPTY: StoreBlob = { version: 1, namespaces: {} };

let cached: StoreBlob | null = null;
let writeChain: Promise<unknown> = Promise.resolve();

async function loadFromDisk(): Promise<StoreBlob> {
  if (!existsSync(STORE_PATH)) return { version: 1, namespaces: {} };
  const key = await getEncryptionKey();
  const blob = readFileSync(STORE_PATH);
  const decrypted = decrypt(blob, key);
  const parsed = JSON.parse(decrypted.toString("utf8")) as StoreBlob;
  if (parsed.version !== 1 || !parsed.namespaces) {
    throw new Error("secrets: store has unexpected shape");
  }
  return parsed;
}

export async function initStore(): Promise<void> {
  const dir = path.dirname(STORE_PATH);
  if (!existsSync(dir)) {
    mkdirSync(dir, { mode: 0o700, recursive: true });
  }
  // Ensure the base ~/.singularity directory exists (it should, but be safe).
  if (!existsSync(SINGULARITY_DIR)) {
    mkdirSync(SINGULARITY_DIR, { mode: 0o700, recursive: true });
  }
  await getEncryptionKey();
  cached = await loadFromDisk();
}

function ensureLoaded(): StoreBlob {
  if (!cached) {
    throw new Error(
      "secrets: store not initialized; secrets.onReady must run before any API call",
    );
  }
  return cached;
}

async function persist(): Promise<void> {
  const blob = ensureLoaded();
  const key = await getEncryptionKey();
  const json = Buffer.from(JSON.stringify(blob), "utf8");
  const encrypted = encrypt(json, key);
  const tmpPath = `${STORE_PATH}.tmp-${randomUUID()}`;
  try {
    await writeFile(tmpPath, encrypted, { mode: 0o600 });
    await chmod(tmpPath, 0o600);
    await rename(tmpPath, STORE_PATH);
  } catch (err) {
    try {
      await unlink(tmpPath);
    } catch {
      /* ignore */
    }
    throw err;
  }
}

function enqueueWrite<T>(fn: () => Promise<T>): Promise<T> {
  const next = writeChain.then(fn, fn);
  writeChain = next.catch(() => undefined);
  return next;
}

export function getLocal(namespace: string, key: string): string | undefined {
  const blob = ensureLoaded();
  return blob.namespaces[namespace]?.[key]?.value;
}

export function hasLocal(namespace: string, key: string): boolean {
  const blob = ensureLoaded();
  return blob.namespaces[namespace]?.[key] !== undefined;
}

export function getMetadataLocal(namespace: string, key: string): SecretMetadata {
  const blob = ensureLoaded();
  const entry = blob.namespaces[namespace]?.[key];
  if (!entry) return { set: false };
  return { set: true, updatedAt: entry.updatedAt };
}

export function listKeysLocal(namespace: string): string[] {
  const blob = ensureLoaded();
  const ns = blob.namespaces[namespace];
  return ns ? Object.keys(ns) : [];
}

export async function setLocal(
  namespace: string,
  key: string,
  value: string,
): Promise<void> {
  return enqueueWrite(async () => {
    const blob = ensureLoaded();
    if (!blob.namespaces[namespace]) blob.namespaces[namespace] = {};
    blob.namespaces[namespace]![key] = { value, updatedAt: Date.now() };
    await persist();
  });
}

export async function deleteLocal(
  namespace: string,
  key: string,
): Promise<void> {
  return enqueueWrite(async () => {
    const blob = ensureLoaded();
    const ns = blob.namespaces[namespace];
    if (!ns) return;
    if (!(key in ns)) return;
    delete ns[key];
    if (Object.keys(ns).length === 0) delete blob.namespaces[namespace];
    await persist();
  });
}

// Exposed for the boot-time legacy migration.
export { EMPTY };
