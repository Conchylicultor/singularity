import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { randomBytes } from "node:crypto";
import { SECRETS_DIR, KEY_PATH } from "./paths";
import { SecretsKeychainLockedError } from "@plugins/secrets/shared";

const KEYCHAIN_SERVICE = "singularity";
const KEYCHAIN_ACCOUNT = "secrets-aes-256-gcm-v1";

let cached: Buffer | null = null;
// biome-ignore lint/suspicious/noExplicitAny: dynamic import, library may be absent.
let keychainModule: any | null | undefined;
let keychainWarned = false;

// biome-ignore lint/suspicious/noExplicitAny: keyring native module has runtime-only shape.
async function loadKeychainModule(): Promise<any | null> {
  if (keychainModule !== undefined) return keychainModule;
  try {
    keychainModule = await import("@napi-rs/keyring");
  } catch {
    keychainModule = null;
  }
  return keychainModule;
}

function readOrCreateKeyFile(): Buffer {
  try {
    if (!existsSync(SECRETS_DIR)) {
      mkdirSync(SECRETS_DIR, { mode: 0o700, recursive: true });
    }
    if (existsSync(KEY_PATH)) {
      const buf = readFileSync(KEY_PATH);
      if (buf.length !== 32) {
        throw new Error(
          `secrets key file ${KEY_PATH} has wrong length (${buf.length} != 32)`,
        );
      }
      return buf;
    }
    const fresh = randomBytes(32);
    writeFileSync(KEY_PATH, fresh, { mode: 0o600 });
    chmodSync(KEY_PATH, 0o600);
    return fresh;
  } catch (err) {
    throw new SecretsKeychainLockedError(
      err instanceof Error ? err.message : String(err),
    );
  }
}

/**
 * Resolve the 32-byte AES-256 key used to encrypt the secrets blob.
 *
 * Primary: OS keychain via `@napi-rs/keyring` (macOS Keychain / libsecret /
 * Windows Credential Manager). Cached in-memory after first read so the OS
 * only prompts once per process lifetime.
 *
 * Fallback: `~/.singularity/secrets/.key` (mode 0600). Used when the native
 * keyring module is unavailable (CI, headless Linux without libsecret) or
 * fails at runtime. Functionally equivalent in the local-only threat model.
 */
export async function getEncryptionKey(): Promise<Buffer> {
  if (cached) return cached;

  const mod = await loadKeychainModule();
  if (mod) {
    try {
      const entry = new mod.Entry(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT);
      const existing = entry.getPassword() as string | null;
      if (existing) {
        const buf = Buffer.from(existing, "base64");
        if (buf.length !== 32) {
          throw new Error(
            `secrets keychain key has wrong length (${buf.length} != 32)`,
          );
        }
        cached = buf;
        return cached;
      }
      const fresh = randomBytes(32);
      entry.setPassword(fresh.toString("base64"));
      cached = fresh;
      return cached;
    } catch (err) {
      if (!keychainWarned) {
        keychainWarned = true;
        console.warn(
          "[secrets] keychain unavailable, falling back to file:",
          err instanceof Error ? err.message : err,
        );
      }
    }
  }

  cached = readOrCreateKeyFile();
  return cached;
}

export function isKeychainCached(): boolean {
  return cached !== null;
}
