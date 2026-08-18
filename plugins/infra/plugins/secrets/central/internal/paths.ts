// The two directories this plugin owns under the data root, declared in
// `data-dirs/index.ts`, plus the file names inside them. One module so every
// reader here names a file the same way and no second spelling can appear.
import { legacyAuthDir, secretsDir } from "../../data-dirs";

export { legacyAuthDir, secretsDir };

/** The AES-256-GCM secrets blob. */
export function storePath(): string {
  return secretsDir.file("secrets.json.enc");
}

/** The fallback master key, used when the OS keychain is unavailable. */
export function keyPath(): string {
  return secretsDir.file(".key");
}

/** The legacy auth blob, read once by the one-shot migration. */
export function legacyAuthBlob(): string {
  return legacyAuthDir.file("tokens.json.enc");
}

/** The legacy auth blob's own key. */
export function legacyAuthKey(): string {
  return legacyAuthDir.file(".key");
}
