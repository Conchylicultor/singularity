import { initTokenStore } from "./token-store";
import { startRefreshLoop } from "./refresh-loop";
import { warmAuthState } from "./auth-state";
import { AuthKeychainLockedError } from "@plugins/auth/core";

let booted = false;

export async function onReady(): Promise<void> {
  if (booted) return;
  booted = true;
  try {
    await initTokenStore();
  } catch (err) {
    if (err instanceof AuthKeychainLockedError) {
      console.error(`[auth] ${err.message}`);
    } else {
      console.error("[auth] failed to initialize token store:", err);
    }
    // Don't crash the runtime — UI surfaces the issue via authStateResource.
  }
  startRefreshLoop();
  // Pre-warm credentials-configured cache so the first GET /api/auth/state
  // doesn't show stale "not configured" while the env probe runs.
  void warmAuthState();
}
