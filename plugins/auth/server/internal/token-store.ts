import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { rename, writeFile, chmod, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import type {
  AuthIdentity,
  AuthProviderKind,
} from "@plugins/auth/shared";
import { decrypt, encrypt } from "./crypto";
import { getOrCreateEncryptionKey } from "./key-store";
import { AUTH_DIR, TOKEN_STORE_PATH } from "./paths";

export interface StoredAccount {
  kind: AuthProviderKind;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
  scopes?: string[];
  idToken?: string;
  apiKey?: string;
  identity: AuthIdentity;
  connectedAt: number;
  lastRefreshedAt?: number;
  needsReconsent?: boolean;
  lastRefreshError?: { message: string; at: number };
}

export interface TokenStoreBlob {
  version: 1;
  providers: {
    [providerId: string]: {
      [accountId: string]: StoredAccount;
    };
  };
}

const EMPTY_BLOB: TokenStoreBlob = { version: 1, providers: {} };

let cached: TokenStoreBlob | null = null;
let key: Buffer | null = null;
// Single-writer mutex to serialize encrypt + write.
let writeChain: Promise<unknown> = Promise.resolve();

function ensureKey(): Buffer {
  if (!key) key = getOrCreateEncryptionKey();
  return key;
}

function loadFromDisk(): TokenStoreBlob {
  if (!existsSync(TOKEN_STORE_PATH)) return { ...EMPTY_BLOB };
  const k = ensureKey();
  const blob = readFileSync(TOKEN_STORE_PATH);
  const decrypted = decrypt(blob, k);
  const parsed = JSON.parse(decrypted.toString("utf8")) as TokenStoreBlob;
  if (parsed.version !== 1 || !parsed.providers) {
    throw new Error("auth: token store has unexpected shape");
  }
  return parsed;
}

export async function initTokenStore(): Promise<void> {
  if (!existsSync(AUTH_DIR)) {
    mkdirSync(AUTH_DIR, { mode: 0o700, recursive: true });
  }
  ensureKey();
  cached = loadFromDisk();
}

function ensureLoaded(): TokenStoreBlob {
  if (!cached) cached = loadFromDisk();
  return cached;
}

async function persist(): Promise<void> {
  const blob = ensureLoaded();
  const json = Buffer.from(JSON.stringify(blob), "utf8");
  const encrypted = encrypt(json, ensureKey());
  const tmpPath = `${TOKEN_STORE_PATH}.tmp-${randomUUID()}`;
  try {
    await writeFile(tmpPath, encrypted, { mode: 0o600 });
    await chmod(tmpPath, 0o600);
    await rename(tmpPath, TOKEN_STORE_PATH);
  } catch (err) {
    // Best-effort cleanup of orphaned tmp file.
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
  // Swallow errors on the chain so a single failure doesn't poison subsequent writes.
  writeChain = next.catch(() => undefined);
  return next;
}

export function getAccount(
  providerId: string,
  accountId = "primary",
): StoredAccount | undefined {
  const blob = ensureLoaded();
  return blob.providers[providerId]?.[accountId];
}

export function listAccounts(
  providerId: string,
): Array<[string, StoredAccount]> {
  const blob = ensureLoaded();
  const accounts = blob.providers[providerId];
  if (!accounts) return [];
  return Object.entries(accounts);
}

export function listProviderIdsWithAccounts(): string[] {
  const blob = ensureLoaded();
  return Object.keys(blob.providers);
}

export async function setAccount(
  providerId: string,
  accountId: string,
  account: StoredAccount,
): Promise<void> {
  return enqueueWrite(async () => {
    const blob = ensureLoaded();
    if (!blob.providers[providerId]) blob.providers[providerId] = {};
    blob.providers[providerId]![accountId] = account;
    await persist();
  });
}

export async function patchAccount(
  providerId: string,
  accountId: string,
  patch: Partial<StoredAccount>,
): Promise<StoredAccount | undefined> {
  return enqueueWrite(async () => {
    const blob = ensureLoaded();
    const existing = blob.providers[providerId]?.[accountId];
    if (!existing) return undefined;
    const updated: StoredAccount = { ...existing, ...patch };
    blob.providers[providerId]![accountId] = updated;
    await persist();
    return updated;
  });
}

export async function deleteAccount(
  providerId: string,
  accountId = "primary",
): Promise<StoredAccount | undefined> {
  return enqueueWrite(async () => {
    const blob = ensureLoaded();
    const accounts = blob.providers[providerId];
    if (!accounts) return undefined;
    const removed = accounts[accountId];
    if (!removed) return undefined;
    delete accounts[accountId];
    if (Object.keys(accounts).length === 0) delete blob.providers[providerId];
    await persist();
    return removed;
  });
}
