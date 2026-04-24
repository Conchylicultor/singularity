import { isMain } from "./paths";
import { initTokenStore } from "./token-store";
import { startUnixSocketServer } from "./unix-rpc/server";
import { startRefreshLoop } from "./refresh-loop";
import { warmAuthState } from "./auth-state";
import { AuthKeychainLockedError } from "@plugins/auth/shared";

let booted = false;

export async function onReady(): Promise<void> {
  if (booted) return;
  booted = true;
  if (isMain()) {
    try {
      await initTokenStore();
    } catch (err) {
      if (err instanceof AuthKeychainLockedError) {
        console.error(`[auth] ${err.message}`);
      } else {
        console.error("[auth] failed to initialize token store:", err);
      }
      // Don't crash the server — UI will surface the issue via authStateResource.
    }
    try {
      await startUnixSocketServer();
    } catch (err) {
      console.error("[auth] failed to start unix socket server:", err);
    }
    startRefreshLoop();
    // Pre-warm credentials-configured cache so the first GET /api/auth/state
    // doesn't show stale "not configured" while the env probe runs.
    void warmAuthState();
  } else {
    // Worktree: nothing to do at boot. The unix-socket client lazily connects
    // on the first getAccessToken / status call.
  }
}
