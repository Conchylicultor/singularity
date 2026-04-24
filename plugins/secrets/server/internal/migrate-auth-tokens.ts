import { existsSync, readFileSync, renameSync } from "node:fs";
import { decrypt } from "./crypto";
import { LEGACY_AUTH_BLOB, LEGACY_AUTH_KEY } from "./paths";
import { hasLocal, setLocal } from "./store";

export const AUTH_TOKENS_NAMESPACE = "auth-tokens";
export const AUTH_TOKENS_KEY = "blob-v1";

/**
 * One-shot migration: read the legacy `~/.singularity/auth/tokens.json.enc`
 * blob with its own `.key`, write it into the secrets store under the
 * `auth-tokens` namespace, then rename both legacy files so they're recoverable
 * if something goes wrong. Idempotent (skips on subsequent boots).
 */
export async function migrateLegacyAuthTokens(): Promise<
  "migrated" | "skipped" | "noop"
> {
  if (!existsSync(LEGACY_AUTH_BLOB) || !existsSync(LEGACY_AUTH_KEY)) {
    return "noop";
  }
  if (hasLocal(AUTH_TOKENS_NAMESPACE, AUTH_TOKENS_KEY)) {
    // Already migrated; leave legacy files alone so the operator can clean up
    // or roll back if desired.
    return "skipped";
  }
  const legacyKey = readFileSync(LEGACY_AUTH_KEY);
  if (legacyKey.length !== 32) {
    throw new Error(
      `[secrets] legacy auth key has wrong length (${legacyKey.length} != 32); skipping migration`,
    );
  }
  const plaintext = decrypt(readFileSync(LEGACY_AUTH_BLOB), legacyKey).toString(
    "utf8",
  );
  const parsed = JSON.parse(plaintext) as { version?: unknown; providers?: unknown };
  if (parsed.version !== 1 || typeof parsed.providers !== "object" || parsed.providers === null) {
    throw new Error("[secrets] legacy auth blob has unexpected shape");
  }
  await setLocal(AUTH_TOKENS_NAMESPACE, AUTH_TOKENS_KEY, plaintext);
  const ts = Date.now();
  try {
    renameSync(LEGACY_AUTH_BLOB, `${LEGACY_AUTH_BLOB}.migrated-${ts}`);
    renameSync(LEGACY_AUTH_KEY, `${LEGACY_AUTH_KEY}.migrated-${ts}`);
  } catch (err) {
    console.warn(
      "[secrets] migration succeeded but failed to rename legacy files:",
      err,
    );
  }
  return "migrated";
}
