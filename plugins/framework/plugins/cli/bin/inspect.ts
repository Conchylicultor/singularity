// Pre-armed inspector for CLI ops (build / check / push).
//
// WHY: the CLI-op wedge (research/2026-07-21-global-cli-op-wedge-*.md) fires
// only under real fleet load and cannot be attached to after launch — bun has
// no attach-after-start (SIGUSR1 KILLS a bun process; verified), and a
// reproduction under synthetic load did not trip in 2h of trying. Arming the
// inspector at launch costs nothing until a client connects (verified: builds
// under --inspect ran at normal duration), so every op is launched inspectable
// and the NEXT field wedge can be profiled the minute the op-wedge watchdog
// flags it — no reproduction lottery. The capture client lives at
// plugins/debug/plugins/op-wedge-watchdog/scripts/inspector-client.ts.
//
// HOW: `singularity <op>` re-execs itself once as
// `bun --inspect=localhost:<freeport>/<token> index.ts <op> …` and mirrors the
// child's exit code. Self-re-exec (rather than arming in the shell wrapper or
// at each spawn site) means EVERY path into an op — the ./singularity wrapper,
// push's nested `check --scope tree` child, the detached self-restart build —
// arms itself with zero per-site wiring, and the guard (`--inspect` already in
// process.execArgv) is inheritance-proof: a nested op spawned by an inspected
// parent still arms its own fresh port. The op marker records the ws URL
// (worktree-op.ts reads execArgv), so the watchdog's marker dump names where to
// connect.
//
// KILL-SWITCH: flip CLI_INSPECT_ENABLED below to disable globally (one place),
// or set SINGULARITY_CLI_INSPECT=0 to disable per-invocation / per-shell
// without a code change. Disable if the inspector is ever suspected of masking
// the wedge (heisenbug) or slowing ops — and say so in the wedge research doc.

export const CLI_INSPECT_ENABLED = true;

// Only the long-running ops worth capturing. Trivial commands (regen-*, db, …)
// stay uninspected: they finish in seconds and the extra process is pure noise.
const INSPECTED_COMMANDS: ReadonlySet<string> = new Set(["build", "check", "push"]);

function alreadyInspected(): boolean {
  return process.execArgv.some((a) => a === "--inspect" || a.startsWith("--inspect="));
}

// Bind port 0 to let the kernel pick a free port, release it, and hand it to
// the child. The tiny bind race is acceptable: bun does NOT crash on an
// occupied inspector port (verified — the op runs, only the inspector is lost).
function pickFreePort(): number {
  const srv = Bun.listen({ hostname: "127.0.0.1", port: 0, socket: { data() {} } });
  const port = srv.port;
  srv.stop(true);
  return port;
}

/**
 * Re-exec this CLI invocation under `bun --inspect=…` when it is an op command
 * and not already inspected. Returns true when the re-exec ran (the caller must
 * NOT continue into the command — the child already did the work; this process
 * only mirrors its exit code).
 */
export async function maybeReexecUnderInspector(): Promise<boolean> {
  if (!CLI_INSPECT_ENABLED) return false;
  if (process.env.SINGULARITY_CLI_INSPECT === "0") return false;
  const command = process.argv[2];
  if (command === undefined || !INSPECTED_COMMANDS.has(command)) return false;
  if (alreadyInspected()) return false;

  // Random path token: only a reader of the op marker (same user) knows the ws
  // URL. The inspector listens on localhost only.
  const url = `localhost:${pickFreePort()}/${crypto.randomUUID().slice(0, 8)}`;
  const child = Bun.spawn(
    [process.execPath, `--inspect=${url}`, process.argv[1]!, ...process.argv.slice(2)],
    { stdin: "inherit", stdout: "inherit", stderr: "inherit" },
  );

  // Terminal-generated signals reach the whole foreground group (both
  // processes), but a programmatic kill of THIS pid must not strand the child —
  // forward the catchable terminals. The child's own handlers (build.ts) turn
  // them into a graceful exit; its ppid-poll covers a SIGKILLed parent.
  for (const sig of ["SIGINT", "SIGTERM", "SIGHUP", "SIGQUIT"] as const) {
    process.on(sig, () => child.kill(sig));
  }

  process.exitCode = await child.exited;
  return true;
}
