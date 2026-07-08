import { existsSync } from "node:fs";
import { dlopen } from "bun:ffi";

const TASKPOLICY = "/usr/sbin/taskpolicy";

// darwinbg (`-b`): pins the spawned subtree to the efficiency cores and applies
// the background disk-IO throttle tier. THE single tunable flag point for how
// hard background work is demoted.
//
// Measured on this host class (Apple Silicon, 6 P + 12 E cores, 2026-07-07):
// a fixed-CPU default-priority probe ran ~idle-fast (5.9 s vs 8.2 s idle
// baseline) against 20 `-b` spinners, but got NO protection from
// `-c utility` spinners (13.4 s vs 13.0 s against default-priority spinners).
// Do NOT switch to `-c utility` — it does not protect the interactive main
// backend at all. See research/2026-07-07-global-background-work-priority-isolation.md.
//
// If an IO-heavy spawn (pg_dump/pg_restore, the 77 MB worktree checkout)
// crawls under the background IO throttle, relax here to ["-b", "-t", "0"]
// (keeps the E-core CPU demotion, lifts the disk throttle) and re-measure.
const DEMOTE_FLAGS = ["-b"];

function prefixTokens(): string[] {
  // Escape hatch + A/B verification harness: disable all demotion host-wide.
  if (process.env.SINGULARITY_NO_SPAWN_PRIORITY === "1") return [];
  if (process.platform === "darwin" && existsSync(TASKPOLICY)) {
    return [TASKPOLICY, ...DEMOTE_FLAGS, "--"];
  }
  // Non-darwin fallback: CPU nice only (no IO demotion). Fail-open — a spawn
  // must never break because the host lacks a priority tool.
  if (process.platform === "linux") return ["nice", "-n", "10"];
  return [];
}

// Prefix an argv array so the spawned process (and every child it forks —
// darwinbg is inherited) runs demoted below the interactive backends.
// Usage: Bun.spawn(backgroundArgv(["pg_dump", ...]), opts)
export function backgroundArgv(argv: string[]): string[] {
  return [...prefixTokens(), ...argv];
}

// Same demotion as a shell-command prefix, for call sites that build a command
// STRING executed by a shell we don't spawn ourselves (e.g. a tmux session
// command, which the shared tmux server forks — demoting the tmux client
// would be a no-op). The prefix is a fixed literal, never interpolated data,
// so it is shell-safe by construction.
export function backgroundPrefix(): string {
  const tokens = prefixTokens();
  return tokens.length > 0 ? `${tokens.join(" ")} ` : "";
}

// macOS QoS class of GUI apps' UI threads (sys/qos.h: QOS_CLASS_USER_INTERACTIVE).
const QOS_CLASS_USER_INTERACTIVE = 0x21;

// Raise the CALLING thread to user-interactive QoS — the tier GUI apps' UI
// threads run at, ABOVE the default tier where un-demoted bulk work (tsc
// workers, builds) competes. Bun runs the event loop, HTTP handlers, and
// live-state pushes on the main thread, so one call at boot from that thread
// shields the backend's latency from default-priority load the same way the
// rest of macOS stays responsive during a build storm. No root needed — a
// process may always raise its own thread's QoS (unlike negative nice).
//
// ONLY the gateway-spawned MAIN backend may call this (gate on isMain() at the
// call site — see server-core/bin/index.ts). Boosting an agent-worktree
// backend would lift the whole fleet above its own builds and defeat priority
// isolation. Context: research/perfs/2026-07-08-host-saturation-agent-checks-starve-main.md.
//
// Fails open with a loud log: a dlopen/symbol failure on a future OS must
// degrade to default priority, never abort main's boot.
export function boostInteractiveQos(): boolean {
  if (process.platform !== "darwin") return false;
  try {
    const { symbols } = dlopen("libSystem.dylib", {
      pthread_set_qos_class_self_np: { args: ["u32", "i32"], returns: "i32" },
    });
    const rc = symbols.pthread_set_qos_class_self_np(QOS_CLASS_USER_INTERACTIVE, 0);
    if (rc !== 0) {
      console.error(`[spawn-priority] pthread_set_qos_class_self_np failed (rc=${rc}); staying at default QoS`);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[spawn-priority] QoS boost unavailable; staying at default QoS", err);
    return false;
  }
}
