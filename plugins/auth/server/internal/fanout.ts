import { existsSync, readdirSync } from "node:fs";
import { WORKTREES_DIR, MAIN_WORKTREE_NAME } from "./paths";

/**
 * Fan out auth-state invalidations to every other worktree.
 *
 * Each worktree's server listens on `<name>.localhost:9000` (via the gateway).
 * After main mutates auth state, it POSTs to each non-main worktree so they
 * call their own `authStateResource.notify()` and push to their tabs. Errors
 * (worktree down, gateway not running) are swallowed — the next time the
 * worktree comes up its loader fetches fresh state via the unix socket.
 */
export async function fanoutInvalidate(): Promise<void> {
  const targets = listWorktreeNames().filter((n) => n !== MAIN_WORKTREE_NAME);
  await Promise.all(
    targets.map(async (name) => {
      try {
        await fetch(`http://${name}.localhost:9000/api/auth/invalidate`, {
          method: "POST",
          // Short signal so a hung worktree doesn't block the chain.
          signal: AbortSignal.timeout(2000),
        });
      } catch {
        /* worktree offline or gateway misrouted; ignored */
      }
    }),
  );
}

function listWorktreeNames(): string[] {
  if (!existsSync(WORKTREES_DIR)) return [];
  try {
    return readdirSync(WORKTREES_DIR)
      .filter((f: string) => f.endsWith(".json"))
      .map((f: string) => f.slice(0, -".json".length));
  } catch {
    return [];
  }
}
