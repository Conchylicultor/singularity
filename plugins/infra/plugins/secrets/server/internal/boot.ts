import { isMain } from "./paths";
import { markReady } from "./ready";
import { initStore } from "./store";
import { getEncryptionKey } from "./key-store";
import { migrateLegacyAuthTokens } from "./migrate-auth-tokens";
import { startUnixSocketServer } from "./unix-rpc/server";
import { SecretsKeychainLockedError } from "@plugins/infra/plugins/secrets/shared";

let booted = false;

export async function onReady(): Promise<void> {
  if (booted) return;
  booted = true;

  if (!isMain()) {
    // Worktrees do nothing at boot; RPC client lazily connects on first call.
    markReady();
    return;
  }

  try {
    await getEncryptionKey();
  } catch (err) {
    if (err instanceof SecretsKeychainLockedError) {
      console.error(`[secrets] ${err.message}`);
    } else {
      console.error("[secrets] failed to resolve encryption key:", err);
    }
    // Resolve anyway — downstream plugins will surface their own errors when
    // they try to read/write.
    markReady();
    return;
  }

  try {
    await initStore();
  } catch (err) {
    console.error("[secrets] failed to initialize store:", err);
    markReady();
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

  try {
    startUnixSocketServer();
  } catch (err) {
    console.error("[secrets] failed to start unix socket server:", err);
  }

  markReady();
}
