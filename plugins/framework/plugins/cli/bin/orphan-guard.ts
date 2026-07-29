export const ORPHAN_EXIT_CODE = 140; // 128 + 12

// The long-running ops worth guarding. Trivial commands (regen-*, db, …) finish
// in seconds and hold no host lock, so an orphan guard on them would only add
// a timer.
const OP_COMMANDS: ReadonlySet<string> = new Set(["build", "check", "push"]);

// Single source for "is this an op command" — co-located with the guard it
// gates so the op set stays defined in one place.
export function isOpCommand(command: string | undefined): boolean {
  return command !== undefined && OP_COMMANDS.has(command);
}

// A foreground `./singularity {build,check,push}` dies with its invoker so an
// orphaned op never holds or queues on a host lock indefinitely. macOS has no
// PDEATHSIG, so a child cannot ask the kernel to signal it when its parent dies
// — poll ppid instead (reparented orphans get ppid 1). The push mutex is the
// worst case: one serialized slot host-wide, so a single orphan-hold stalls
// every agent's push. Run onOrphan when reparented; unref so the timer never
// itself keeps the process alive.
export function installOrphanGuard(onOrphan: () => void): void {
  // The detached self-restart build (build/run-build.ts) sets this and INTENDS
  // to outlive the backend it restarts — it must never self-terminate on reparent.
  if (process.env.SINGULARITY_BUILD_DETACHED) return;
  if (process.ppid === 1) { onOrphan(); return; } // already orphaned at launch
  setInterval(() => {
    if (process.ppid === 1) onOrphan();
  }, 2000).unref();
}
