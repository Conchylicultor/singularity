/**
 * WHO sent a fatal signal, as recorded by the native tap at delivery time.
 *
 * This lives in `core/` rather than `server/` because the two consumers are on
 * opposite sides of the FFI line: the CLI arms the tap and reads it, while a
 * server/web surface only ever renders a record it was handed (from the deploy
 * receipt or the JSONL sink). Neither of the latter may pull in `bun:ffi`, so
 * the type and its formatter have to be reachable without it — the same reason
 * `spawn-priority` keeps `backgroundArgv` in `core/`.
 */

/** One process in the sender's ancestry chain. */
export interface SignalOriginProc {
  pid: number;
  ppid: number;
  uid: number;
  /** Short process name (darwin `pbsi_comm`, linux `/proc/<pid>/stat`). Resolves for any pid, including across uids. */
  comm: string;
}

export interface SignalOrigin {
  /** POSIX signal number, as delivered. */
  signal: number;
  /**
   * RAW `si_code`, a breadcrumb only. Do NOT compare it against `SI_USER`:
   * darwin's `<sys/signal.h>` declares `SI_USER == 0x10001` while XNU delivers
   * `1`. The portable discriminator is `senderPid`.
   */
  siCode: number;
  /**
   * The signalling process, or `0` when the kernel or the tty generated the
   * signal — which is where an interactive Ctrl-C lands, and is itself worth
   * distinguishing from "an agent ran `kill`".
   */
  senderPid: number;
  senderUid: number;
  /**
   * The sender's executable path, or `null` when it could not be read — the
   * sender was already reaped, or it belongs to another uid (EPERM). `comm`
   * from `ancestry[0]` still names it in that case.
   */
  senderPath: string | null;
  /**
   * The sender and up to 7 of its forebears, nearest first — `ancestry[0]` is
   * the sender itself. Captured inside the signal handler, because the
   * `/bin/kill` that sent the signal is usually reaped within milliseconds and
   * would no longer resolve by the time any JS runs. May be shorter than the
   * real chain (or empty) when a link could not be read.
   */
  ancestry: SignalOriginProc[];
  /**
   * WHY the ancestry walk stopped: `0` means it reached the root (or the
   * 8-level cap), anything else is the errno that ended it.
   *
   * `ESRCH` (3) is the common and important one, and it is the inherent limit
   * of this mechanism: a short-lived sender such as `/bin/kill` is often reaped
   * by its own parent before the receiving process is even scheduled to run the
   * handler, and no mechanism can resolve a reaped pid. `senderPid`/`senderUid`
   * still hold — the handler is already the earliest observable moment.
   *
   * This field exists so an empty `ancestry` is never an absorbable failure:
   * "could not read the sender" and "the sender had no forebears" are different
   * facts and must not share a representation.
   */
  ancestryErrno: number;
  /** The RECEIVER's parent pid at signal time — it may have been reparented to 1 by the time an exit hook runs. */
  selfPpid: number;
  /** CLOCK_REALTIME nanoseconds, as a decimal string: the value exceeds 2^53, so a JSON number would lose precision. */
  wallNs: string;
  /** CLOCK_MONOTONIC_RAW nanoseconds, as a decimal string. Same reason. */
  monoNs: string;
  /** How many deliveries of this signal the tap saw. >1 means a repeated kill. */
  hits: number;
}

/**
 * Signal names that agree across darwin and linux. Deliberately partial: the
 * numbers DIVERGE (`SIGBUS` is 10 on darwin and 7 on linux; `SIGUSR1` is 30 vs
 * 10), and this function is pure — it has no platform to consult and must not
 * pretend otherwise. Everything the CLI arms (HUP/INT/QUIT/TERM) is in here;
 * anything else formats as `signal <n>`, which is honest rather than wrong.
 */
const PORTABLE_SIGNAL_NAMES: Record<number, string> = {
  1: "SIGHUP",
  2: "SIGINT",
  3: "SIGQUIT",
  4: "SIGILL",
  5: "SIGTRAP",
  6: "SIGABRT",
  8: "SIGFPE",
  9: "SIGKILL",
  11: "SIGSEGV",
  13: "SIGPIPE",
  14: "SIGALRM",
  15: "SIGTERM",
};

/** `ESRCH` — 3 on both darwin and linux. "That pid no longer exists." */
const ESRCH = 3;

/** `15` → `"SIGTERM"`; an ambiguous or unknown number → `"signal 30"`. */
export function signalName(signo: number): string {
  return PORTABLE_SIGNAL_NAMES[signo] ?? `signal ${signo}`;
}

/**
 * One human-readable line naming the killer. Pure — no I/O, no platform reads —
 * so it is unit-testable and usable from any runtime.
 *
 *   SIGTERM from pid 41234 (/bin/kill) ← 41198 bun ← 872 tmux ← 1 launchd, uid 501
 *   SIGTERM from pid 41234 (already exited), uid 501
 *   SIGINT from the terminal (kernel-generated)
 */
export function formatSignalOrigin(o: SignalOrigin): string {
  const sig = signalName(o.signal);
  if (o.senderPid === 0) return `${sig} from the terminal (kernel-generated)`;

  // The full path when we could read it, else the sender's own `comm` — which
  // resolves across uids where the path does not. When the walk failed with
  // ESRCH, say so rather than "unknown": the pid is still a real, actionable
  // fact, and "the sender was gone before we could look" is the explanation.
  const label =
    o.senderPath ??
    o.ancestry[0]?.comm ??
    (o.ancestryErrno === ESRCH ? "already exited" : "unknown");
  // ancestry[0] IS the sender, already named by the head; the chain continues
  // from its parent.
  const chain = o.ancestry.slice(1).map((a) => `${a.pid} ${a.comm}`);
  const tail = chain.length > 0 ? ` ← ${chain.join(" ← ")}` : "";
  return `${sig} from pid ${o.senderPid} (${label})${tail}, uid ${o.senderUid}`;
}
