let resolveReady!: () => void;

/**
 * Resolves once the secrets plugin's onReady has finished (key loaded, store
 * hydrated, unix socket up). Consumers on main (auth, config) await this from
 * inside their own onReady before issuing secrets API calls — onReady runs
 * with Promise.all, so plugin registration order is not load order.
 *
 * On worktrees this resolves immediately: worktree secrets calls go over the
 * unix socket to main, and the socket server on the main process is what
 * needs readiness coordination.
 */
export const ready: Promise<void> = new Promise<void>((r) => {
  resolveReady = r;
});

export function markReady(): void {
  resolveReady();
}
