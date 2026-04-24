import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { randomBytes } from "node:crypto";
import { AUTH_DIR, KEY_PATH } from "./paths";
import { AuthKeychainLockedError } from "@plugins/auth/shared";

/**
 * Returns the 32-byte AES-256 key used to encrypt tokens.json.enc.
 *
 * MVP storage: a 0600 file at ~/.singularity/auth/.key (generated on first
 * boot of main). Functionally equivalent to keychain in the local-only threat
 * model, since both the key and ciphertext live on the same disk with the
 * same permissions. Migration to OS keychain (keytar / @napi-rs/keyring) is
 * deferred — see plugins/auth/CLAUDE.md.
 */
export function getOrCreateEncryptionKey(): Buffer {
  try {
    if (!existsSync(AUTH_DIR)) {
      mkdirSync(AUTH_DIR, { mode: 0o700, recursive: true });
    }
    if (existsSync(KEY_PATH)) {
      const buf = readFileSync(KEY_PATH);
      if (buf.length !== 32) {
        throw new Error(
          `auth key file ${KEY_PATH} has wrong length (${buf.length} != 32)`,
        );
      }
      return buf;
    }
    const key = randomBytes(32);
    writeFileSync(KEY_PATH, key, { mode: 0o600 });
    chmodSync(KEY_PATH, 0o600);
    return key;
  } catch (err) {
    throw new AuthKeychainLockedError(
      err instanceof Error ? err.message : String(err),
    );
  }
}
