import { initStore } from "./store";
import { getEncryptionKey } from "./key-store";
import { migrateLegacyAuthTokens } from "./migrate-auth-tokens";
import { SecretsKeychainLockedError } from "@plugins/infra/plugins/secrets/core";

let booted = false;
let resolveReady: () => void;
/**
 * Resolves when the encryption key is loaded and the store is hydrated. Used
 * by sibling central plugins (auth) so their own onReady can `await ready`
 * regardless of the order plugins start in.
 */
export const ready: Promise<void> = new Promise<void>((r) => {
  resolveReady = r;
});

export async function onReady(): Promise<void> {
  if (booted) return;
  booted = true;

  try {
    await getEncryptionKey();
  } catch (err) {
    if (err instanceof SecretsKeychainLockedError) {
      console.error(`[secrets] ${err.message}`);
    } else {
      console.error("[secrets] failed to resolve encryption key:", err);
    }
    // Resolve anyway — downstream HTTP handlers will surface their own errors
    // when they try to read/write.
    resolveReady();
    return;
  }

  try {
    await initStore();
  } catch (err) {
    console.error("[secrets] failed to initialize store:", err);
    resolveReady();
    return;
  }

  try {
    const result = await migrateLegacyAuthTokens();
    if (result === "migrated") {
      console.log(
        "[secrets] migrated legacy ~/.singularity/auth tokens into secrets store",
      );
    }
  } catch (err) {
    console.error("[secrets] legacy auth-token migration failed:", err);
  }

  resolveReady();
}
