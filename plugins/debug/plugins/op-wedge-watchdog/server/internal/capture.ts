// Forensics capture of a LIVE wedged `bun cli/bin/index.ts {build,check,push}`.
//
// Read `research/2026-07-20-global-cli-op-wedge-capture-watchdog.md` before
// touching this. Three static sweeps of the build/check path found nothing; the
// gap is that nobody has ever inspected a wedge while it was still wedged. This
// module is that inspection. Everything here is READ-ONLY on the specimen — we
// never signal, never kill, never `clearWorktreeOp`. An intact live wedge is the
// entire value; reaping is a separate module (`reap.ts`), invoked by the monitor
// only AFTER every capture step (this one and the JS interrogation) has banked
// its evidence.
//
// Two design constraints are load-bearing and easy to get wrong:
//
//  1. **The verdict comes from a cpu-time DELTA, never a single `%CPU`.** A prior
//     investigation was derailed for two sessions by reading `ps` `%CPU` once and
//     concluding "spinning at ~95%". `%CPU` on macOS is a *lifetime average*: a
//     process that burned 20 minutes of CPU and has since parked in `kevent64`
//     forever still reports a high number. We read cumulative cpu time twice and
//     divide by measured wall time, so "idle" and "spinning" are distinguishable
//     facts rather than a misreadable number.
//
//  2. **Every child we spawn is drained and bounded.** This is the tool that
//     diagnoses un-awaited, unbounded child spawns (the leading hypothesis is a
//     `git` child whose stdout never EOFs). It must not contain the same defect,
//     or a wedge would silently wedge its own watchdog. `runBounded` awaits
//     `proc.exited`, drains BOTH pipes, and SIGKILLs on a deadline.

import { join } from "node:path";
import { readFile } from "node:fs/promises";
import { defineFileSink, type FileSink } from "@plugins/infra/plugins/file-sink/core";
import { PS, SINGULARITY_DIR, worktreeDataDir } from "@plugins/infra/plugins/paths/server";

// ---------------------------------------------------------------------------
// Public contract
// ---------------------------------------------------------------------------

export interface WedgeCaptureRequest {
  /** pid of the wedged CLI process */
  pid: number;
  /** worktree slug the op belongs to */
  worktree: string;
  /** "build" | "check" | "push" */
  op: string;
  /** ISO timestamp the op started (from the op marker) */
  startedAt: string;
}

/** One descendant process of the wedged pid. */
export interface WedgeChild {
  pid: number;
  ppid: number;
  state: string;
  etime: string;
  command: string;
  /**
   * `ps` lifetime-average %CPU — context only, kept because the row already
   * carries it. NEVER a verdict input: a process that burned 20 minutes and has
   * since parked still reports a high number (the misread that derailed a prior
   * investigation). The verdict-grade number is `cpuRatio`.
   */
  cpuPct: string;
  /**
   * Sampled cpu-time delta ratio over the capture window, per descendant. Null
   * when not computable (a cpu table read failed, or the pid spawned/vanished
   * mid-window) — null and 0 must not collapse, or "unmeasurable" reads "idle".
   */
  cpuRatio: number | null;
}

export interface WedgeCapture {
  /** Absolute path of the durable dump written for this wedge. */
  dumpPath: string;
  /** True when the process was still alive for the whole capture. */
  alive: boolean;
  /**
   * cpu-time delta of the SPECIMEN over the sampling interval, and the derived
   * tree-aware verdict: `spinning` when ANY of marker∪descendants crossed the
   * threshold, `idle` only when none did (and the marker was measurable).
   */
  cpu: { deltaMs: number; wallMs: number; ratio: number; verdict: "spinning" | "idle" | "unknown" };
  /**
   * The process the evidence should chase: the max-ratio spinning member of
   * marker∪descendants, falling back to the marker pid when nothing spins. The
   * 2026-07-22 m0gj incident is why this exists — the marker pid (an idle push
   * worker) was NOT the wedge; a marker-less nested-check grandchild burning
   * 99% CPU was. `inspect` is parsed from the specimen's own argv, so the JS
   * interrogation and the reap can follow the true wedge.
   */
  specimen: { pid: number; command: string; cpuRatio: number; inspect: string | null };
  /** One entry per descendant process, nearest-first. */
  children: WedgeChild[];
  /** Which capture steps failed, empty when all succeeded. Never silently dropped. */
  failures: Array<{ step: string; error: string }>;
}

/**
 * Tuning knobs, defaulted to the plan's numbers. ADDITIVE and optional — a caller
 * passing only the request gets exactly the documented behaviour. It exists so the
 * co-located test can exercise the real code path in ~1s instead of 15s; a
 * "shorten it for tests" fork of this function would test something other than
 * what runs in production, which is the whole failure mode this file guards.
 */
export interface WedgeCaptureOptions {
  /** Duration passed to `sample <pid> <n>`. Default 10 (the plan's value). */
  sampleSeconds?: number;
  /** Minimum wall gap between the two cpu-time reads. Default 5000ms. */
  cpuIntervalMs?: number;
  /**
   * Where the dump lands. Defaults to the host-global forensics sink below.
   * Injectable so the co-located suite is hermetic: `SINGULARITY_DIR` is frozen
   * at module eval by the `bun test` preload, so a test cannot redirect the
   * default path by env — and without a seam every test run would append fake
   * wedges to the real forensics log, leaving test noise in the evidence
   * someone reads during an actual incident.
   */
  sink?: FileSink;
}

// ---------------------------------------------------------------------------
// The dump sink
// ---------------------------------------------------------------------------

/**
 * Forensics, not a firehose. A single capture is a `sample` (~50-250 KB for a Bun
 * process with ~24 threads) plus an `lsof` and a process table, so 4 MB × keep 3
 * retains on the order of 20-40 captures — many more than the four occurrences
 * seen in 48h, and a hard 12 MB ceiling either way.
 *
 * Host-global (`~/.singularity/`), not per-worktree, for the same reason
 * `check-progress.jsonl` is: the watchdog runs main-only and files for EVERY
 * worktree, and an incident is read from whichever shell is free — not from the
 * wedged worktree, which by construction is the one you cannot use. Each capture
 * is one `append()` of a multi-line block, so a block is never torn by rotation.
 */
export const captureSink = defineFileSink({
  id: "op-wedge-capture",
  description:
    "Forensic dumps of live-wedged `./singularity {build,check,push}` processes: " +
    "`sample` thread states, the descendant process tree, `lsof`, and the op marker. " +
    "Written by the op-wedge watchdog, one block per wedge.",
  path: join(SINGULARITY_DIR, "op-wedge-captures.log"),
  maxBytes: 4 * 1024 * 1024,
  keep: 3,
});

/**
 * Per-section clamp. One pathological `lsof` (a process holding tens of thousands
 * of fds) must not consume a whole rotation slot and evict every other capture —
 * the bound would still hold, but the *history* would be destroyed by one outlier.
 */
const MAX_SECTION_BYTES = 512 * 1024;

// ---------------------------------------------------------------------------
// Bounded, fully-drained child execution
// ---------------------------------------------------------------------------

export type RunResult =
  | { ok: true; stdout: string; stderr: string; exitCode: number }
  | { ok: false; error: string };

/**
 * Spawn, drain both pipes, await exit, SIGKILL on deadline. All four properties
 * matter and none is optional:
 *
 * - **Drain both pipes.** An undrained pipe was refuted as the cause of THIS bug
 *   (bun does not deadlock at 64 KB — see the research doc, disproven #7), but
 *   `sample`/`lsof` legitimately emit hundreds of KB and leaving a pipe unread is
 *   sloppy in the one file that must be beyond reproach on this point.
 * - **`await proc.exited`.** `getRoot()` in `grep-code.ts` — the leading suspect —
 *   awaits the stdout text and never the exit. We do not repeat that here.
 * - **Deadline SIGKILL.** Killing OUR OWN diagnostic child is not killing the
 *   specimen. Without it, an `lsof` that itself blocks on a wedged fd would hang
 *   the watchdog job forever, which is precisely the class of bug under study.
 * - **Non-zero exit is a FAILURE.** `{ ok: true, exitCode: 1 }` handed back with
 *   empty stdout would read as a successful empty capture.
 */
export async function runBounded(cmd: string[], timeoutMs: number): Promise<RunResult> {
  // Typed with the literal stdio shape rather than `ReturnType<typeof Bun.spawn>`:
  // the latter widens to the union over every stdio option, so `proc.stdout`
  // becomes `number | ReadableStream | undefined` and the reads below stop
  // type-checking. Naming the shape keeps both pipes statically ReadableStreams —
  // which is what makes "both are drained" checkable rather than asserted.
  let proc: Bun.Subprocess<"ignore", "pipe", "pipe">;
  try {
    proc = Bun.spawn(cmd, { stdout: "pipe", stderr: "pipe", stdin: "ignore" });
  } catch (err) {
    return { ok: false, error: `spawn failed: ${String(err)}` };
  }

  // A holder rather than a `let`: TS's control-flow analysis cannot see the
  // deadline callback and would narrow a plain boolean to "always false",
  // deleting the `timedOut` branch from the type's point of view.
  const deadline = { fired: false };
  const timer = setTimeout(() => {
    deadline.fired = true;
    proc.kill("SIGKILL");
  }, timeoutMs);
  // Never let the diagnostic's own timer be a reason a process stays alive.
  timer.unref();

  try {
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
    if (deadline.fired) {
      return { ok: false, error: `timed out after ${timeoutMs}ms (SIGKILLed)` };
    }
    if (exitCode !== 0) {
      return { ok: false, error: `exit ${exitCode}: ${stderr.trim().slice(0, 400) || "(no stderr)"}` };
    }
    return { ok: true, stdout, stderr, exitCode };
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

/**
 * Liveness without side effects. Signal 0 delivers nothing; EPERM means alive but
 * foreign-owned. Mirrors `isPidAlive` in worktree-op.ts — deliberately re-derived
 * rather than imported, because that module's readers REAP dead markers as they
 * scan and a capture must never mutate the scene it is photographing.
 */
function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === "EPERM";
  }
}

/**
 * `ps` cumulative cpu time → ms. Accepts every shape macOS emits:
 * `MM:SS.cc`, `HH:MM:SS.cc`, `DD-HH:MM:SS`. Returns null on anything else rather
 * than 0 — "unparseable" and "burned no cpu" must not collapse, or the verdict
 * would silently read "idle" for a parse bug.
 */
export function parseCpuTimeMs(raw: string): number | null {
  const m = /^(?:(\d+)-)?(?:(\d+):)?(\d+):(\d+(?:\.\d+)?)$/.exec(raw.trim());
  if (!m) return null;
  const days = Number(m[1] ?? 0);
  const hours = Number(m[2] ?? 0);
  const mins = Number(m[3]);
  const secs = Number(m[4]);
  return ((days * 24 + hours) * 3600 + mins * 60 + secs) * 1000;
}

/**
 * Extract a pre-armed `--inspect=<host:port/token>` URL from a process's full
 * argv (macOS `ps command` prints the complete command line). Returns null for a
 * bare `--inspect` (nothing to connect to) or no flag.
 *
 * Deliberately watchdog-local rather than shared with worktree-op.ts: that
 * module derives the marker's URL from the *writing process's own*
 * `process.execArgv`; here we parse a DIFFERENT process's argv — a marker-less
 * wedged descendant (e.g. a push-nested check, which by design writes no
 * marker). Same value, different provenance, one-line regex.
 */
export function parseInspectFlag(command: string): string | null {
  const m = /--inspect=(\S+)/.exec(command);
  return m ? m[1]! : null;
}

/**
 * One cumulative-cpu-time snapshot of EVERY pid on the host, stamped with the
 * wall clock it was taken at. Whole-table rather than per-pid on purpose: the
 * specimen may turn out to be any member of the marker's descendant tree, whose
 * membership is only known after the (later) tree read — and two per-instant
 * table snapshots keep every candidate's delta coherent, at the same spawn count
 * as the two single-pid reads this replaced.
 */
async function readCpuTable(): Promise<{ table: Map<number, number>; atMs: number } | { error: string }> {
  const atMs = Date.now();
  const res = await runBounded([PS, "-axo", "pid=,time="], 10_000);
  if (!res.ok) return { error: res.error };
  const table = new Map<number, number>();
  for (const line of res.stdout.split("\n")) {
    const m = /^\s*(\d+)\s+(\S+)\s*$/.exec(line);
    if (!m) continue;
    const cpuMs = parseCpuTimeMs(m[2]!);
    if (cpuMs !== null) table.set(Number(m[1]), cpuMs);
  }
  return { table, atMs };
}

interface PsRow extends WedgeChild {
  cpuPct: string;
}

/**
 * Whole process table, once, then walked in memory. One spawn instead of one per
 * tree level: the tree is being read WHILE it may be changing, and N sequential
 * `ps` calls would stitch together a tree that never existed at any instant.
 */
function parsePsTable(stdout: string): Map<number, PsRow> {
  const rows = new Map<number, PsRow>();
  for (const line of stdout.split("\n")) {
    // `pid ppid stat %cpu etime command…` — command is the rest, spaces and all.
    const m = /^\s*(\d+)\s+(\d+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(.*)$/.exec(line);
    if (!m) continue;
    rows.set(Number(m[1]), {
      pid: Number(m[1]),
      ppid: Number(m[2]),
      state: m[3]!,
      cpuPct: m[4]!,
      etime: m[5]!,
      command: m[6]!,
    });
  }
  return rows;
}

/**
 * Descendants of `root`, BFS so the list is nearest-first — the immediate child is
 * the answer to the decisive question ("is a `git` still alive?") and must not be
 * buried under a grandchild's subtree.
 */
function descendantsOf(rows: Map<number, PsRow>, root: number): PsRow[] {
  const byParent = new Map<number, PsRow[]>();
  for (const row of rows.values()) {
    const siblings = byParent.get(row.ppid);
    if (siblings) siblings.push(row);
    else byParent.set(row.ppid, [row]);
  }
  const out: PsRow[] = [];
  const seen = new Set<number>([root]);
  let frontier = [root];
  while (frontier.length > 0) {
    const next: number[] = [];
    for (const parent of frontier) {
      for (const child of byParent.get(parent) ?? []) {
        // Guard against a pid-reuse cycle making this walk unbounded.
        if (seen.has(child.pid)) continue;
        seen.add(child.pid);
        out.push(child);
        next.push(child.pid);
      }
    }
    frontier = next;
  }
  return out;
}

function clamp(text: string): string {
  if (text.length <= MAX_SECTION_BYTES) return text;
  return `${text.slice(0, MAX_SECTION_BYTES)}\n… [truncated at ${MAX_SECTION_BYTES} bytes]`;
}

// DELIBERATELY ABSENT: the check-progress tail for the wedged pid.
//
// Reading it means calling `readCheckProgress` from `checks/core` — the CLI's
// check runner. A static import would make this the first server plugin to drag
// that whole runner into the main backend's boot graph, and the lazy `await
// import` that avoids the boot cost is rejected by the `inline-import` boundary
// rule (an undeclared cross-plugin edge). Rather than take either the boot-weight
// regression or a change to load-bearing boundary infrastructure, the section is
// omitted.
//
// The loss is small and recoverable: the decisive datum here is the descendant
// process tree, and `check-progress.jsonl` remains independently readable via
// `./singularity check --status`. Every dump records the pid and both timestamps,
// so a reader can correlate the two by hand. If that correlation ever proves
// load-bearing, the principled fix is to extract `readCheckProgress` + the
// progress-log path into a leaf plugin both runtimes may import — NOT to widen
// the boundary rule or to re-derive the path and record grammar here.

// ---------------------------------------------------------------------------
// The capture
// ---------------------------------------------------------------------------

/**
 * Capture one live wedge. Single-shot and bounded: worst case is roughly
 * `sampleSeconds` + the cpu interval + a few seconds of `lsof`/`ps`. The CALLER
 * owns dedupe (once per `(worktree, op, pid)`) — `sample` is expensive and must
 * not run every tick.
 *
 * Returns a result object rather than throwing, and that IS the sanctioned
 * discriminated shape here: a partial capture is still evidence (a `sample` that
 * failed while the child tree came back clean still answers the decisive
 * question), and a throw would discard it. What it must never do is present a
 * partial capture as complete — hence `failures`, which every caller and the dump
 * header both surface.
 */
export async function captureOpWedge(
  req: WedgeCaptureRequest,
  opts: WedgeCaptureOptions = {},
): Promise<WedgeCapture> {
  const sampleSeconds = opts.sampleSeconds ?? 10;
  const cpuIntervalMs = opts.cpuIntervalMs ?? 5_000;
  const sink = opts.sink ?? captureSink;
  const failures: Array<{ step: string; error: string }> = [];
  const fail = (step: string, error: string): void => {
    failures.push({ step, error });
  };

  const aliveAtStart = isPidAlive(req.pid);
  if (!aliveAtStart) fail("liveness", `pid ${req.pid} was already gone when the capture began`);

  // --- cpu read #1, taken FIRST so the expensive `sample` doubles as the wall gap.
  const cpu1 = await readCpuTable();
  if ("error" in cpu1) fail("cpu-sample-1", cpu1.error);
  else if (!cpu1.table.has(req.pid)) fail("cpu-sample-1", `pid ${req.pid} absent from the process table`);

  // --- 1. sample: thread states. Settles spin-vs-block for this occurrence.
  const sampleBin = Bun.which("sample") ?? "sample";
  const sampleRes = await runBounded(
    [sampleBin, String(req.pid), String(sampleSeconds)],
    (sampleSeconds + 20) * 1000,
  );
  if (!sampleRes.ok) fail("sample", sampleRes.error);

  // --- cpu read #2. Wall gap is MEASURED, never assumed: `sample` may have taken
  //     longer or (on failure) returned instantly, and a ratio over an assumed
  //     interval is exactly the kind of unearned number that derailed the last
  //     investigation. Top up only if `sample` did not already cover the interval.
  const elapsedSoFar = "error" in cpu1 ? 0 : Date.now() - cpu1.atMs;
  if (elapsedSoFar < cpuIntervalMs) {
    await Bun.sleep(cpuIntervalMs - elapsedSoFar);
  }
  const cpu2 = await readCpuTable();
  if ("error" in cpu2) fail("cpu-sample-2", cpu2.error);
  else if (!cpu2.table.has(req.pid)) fail("cpu-sample-2", `pid ${req.pid} absent from the process table`);

  // Per-pid delta ratio over the measured window. Null (not 0) when either table
  // read failed, the window is degenerate, or the pid was absent from a snapshot
  // (spawned or died mid-window) — "unmeasurable" and "idle" must not collapse.
  const bothOk = !("error" in cpu1) && !("error" in cpu2);
  const wallMs = bothOk ? cpu2.atMs - cpu1.atMs : 0;
  const ratioOf = (pid: number): number | null => {
    if (!bothOk || wallMs <= 0) return null;
    const a = cpu1.table.get(pid);
    const b = cpu2.table.get(pid);
    if (a === undefined || b === undefined) return null;
    return (b - a) / wallMs;
  };

  // --- 2. the descendant process tree. THE decisive datum.
  let children: WedgeChild[] = [];
  let treeText = "(unavailable)";
  let markerCommand: string | null = null;
  const psRes = await runBounded(
    [PS, "-axo", "pid=,ppid=,stat=,%cpu=,etime=,command="],
    15_000,
  );
  let descendants: PsRow[] = [];
  if (!psRes.ok) {
    fail("ps-tree", psRes.error);
  } else {
    const rows = parsePsTable(psRes.stdout);
    const self = rows.get(req.pid);
    markerCommand = self?.command ?? null;
    descendants = descendantsOf(rows, req.pid);
    children = descendants.map(({ pid, ppid, state, etime, command, cpuPct }) => ({
      pid,
      ppid,
      state,
      etime,
      command,
      cpuPct,
      cpuRatio: ratioOf(pid),
    }));
    const fmt = (r: PsRow): string => {
      const ratio = ratioOf(r.pid);
      return (
        `  ${r.pid}\tppid=${r.ppid}\tstat=${r.state}\t%cpu=${r.cpuPct}` +
        `\tΔratio=${ratio === null ? "n/a" : ratio.toFixed(3)}\tetime=${r.etime}\t${r.command}`
      );
    };
    treeText = [
      self ? `SELF:\n${fmt(self)}` : `SELF: pid ${req.pid} not present in the process table`,
      descendants.length === 0
        ? "DESCENDANTS: none — the wedged process has NO live children."
        : `DESCENDANTS (${descendants.length}, nearest-first):\n${descendants.map(fmt).join("\n")}`,
    ].join("\n");
  }

  // --- specimen selection + tree-aware verdict. The marker pid is the ENTRY
  //     POINT, not necessarily the wedge: a push-nested check writes no marker by
  //     design, so the burning process can be any descendant (2026-07-22 m0gj:
  //     idle push worker marker, 99%-CPU nested-check grandchild). The specimen —
  //     the process the JS interrogation and the reap chase — is chosen by
  //     evidence: the max-ratio spinning member of marker∪descendants, falling
  //     back to the marker when nothing spins.
  const candidates = [req.pid, ...descendants.map((d) => d.pid)];
  let specimenPid = req.pid;
  let bestRatio = -1;
  for (const pid of candidates) {
    const ratio = ratioOf(pid);
    if (ratio !== null && ratio > 0.5 && ratio > bestRatio) {
      specimenPid = pid;
      bestRatio = ratio;
    }
  }
  const anySpinning = bestRatio > -1;
  const markerRatio = ratioOf(req.pid);
  const specimenRatio = ratioOf(specimenPid) ?? 0;
  const specimenCommand =
    specimenPid === req.pid
      ? (markerCommand ?? "(ps-tree unavailable)")
      : (descendants.find((d) => d.pid === specimenPid)?.command ?? "(ps-tree unavailable)");
  const specimen: WedgeCapture["specimen"] = {
    pid: specimenPid,
    command: specimenCommand,
    cpuRatio: specimenRatio,
    inspect: parseInspectFlag(specimenCommand),
  };
  const specimenDelta = (pid: number): number => {
    if (!bothOk) return 0;
    const a = cpu1.table.get(pid);
    const b = cpu2.table.get(pid);
    return a === undefined || b === undefined ? 0 : b - a;
  };
  const cpu: WedgeCapture["cpu"] = {
    deltaMs: specimenDelta(specimenPid),
    wallMs,
    ratio: specimenRatio,
    // `idle` is asserted only when the marker was actually measurable; a failed
    // read must surface as "unknown", never as a confident idle.
    verdict: anySpinning ? "spinning" : markerRatio !== null ? "idle" : "unknown",
  };

  // --- 3. lsof: what the process still holds.
  const lsofBin = Bun.which("lsof") ?? "lsof";
  // `lsof` exits non-zero when it merely warns (e.g. an inaccessible mount) yet
  // still prints a usable table, so its stdout is kept either way — but the
  // non-zero exit is still recorded as a failure rather than passed off as clean.
  const lsofRes = await runBounded([lsofBin, "-p", String(req.pid)], 30_000);
  if (!lsofRes.ok) fail("lsof", lsofRes.error);

  // --- 4a. the op marker, read RAW. Deliberately not via `isWorktreeOpActive` /
  //     `listActiveWorktreeOps`: those reap dead or unparseable markers as they
  //     scan, and a forensic read must not delete its own evidence.
  const markerPath = join(worktreeDataDir(req.worktree), "ops", `${req.op}.json`);
  let markerText: string;
  try {
    markerText = await readFile(markerPath, "utf8");
  } catch (err) {
    markerText = "(unreadable)";
    fail("op-marker", `${markerPath}: ${String(err)}`);
  }

  const aliveAtEnd = isPidAlive(req.pid);
  if (aliveAtStart && !aliveAtEnd) {
    fail("liveness", `pid ${req.pid} exited DURING the capture — readings are not of a steady wedge`);
  }
  const alive = aliveAtStart && aliveAtEnd;

  const capturedAt = new Date().toISOString();
  const header = [
    "".padEnd(78, "="),
    `OP WEDGE CAPTURE  ${capturedAt}`,
    `worktree=${req.worktree} op=${req.op} pid=${req.pid} startedAt=${req.startedAt}`,
    `wedgedForMs=${Date.now() - Date.parse(req.startedAt)}`,
    `alive=${alive}  cpu.verdict=${cpu.verdict} (delta=${cpu.deltaMs}ms / wall=${cpu.wallMs}ms = ${cpu.ratio.toFixed(3)})`,
    `specimen=pid ${specimen.pid} ratio=${specimen.cpuRatio.toFixed(3)} ` +
      `(${specimen.pid === req.pid ? "the marker pid itself" : "a marker-less DESCENDANT — probe/reap follow it, not the marker"})`,
    failures.length === 0
      ? "failures: none — this capture is COMPLETE"
      : `failures: ${failures.length} — this capture is PARTIAL:\n${failures.map((f) => `  - ${f.step}: ${f.error}`).join("\n")}`,
    "".padEnd(78, "="),
  ].join("\n");

  const body = [
    header,
    "",
    "--- [1] sample (thread states) ---",
    sampleRes.ok ? clamp(sampleRes.stdout) : "(unavailable — see failures)",
    "",
    "--- [2] process tree (IS A `git` CHILD STILL ALIVE?) ---",
    clamp(treeText),
    "",
    "--- [3] lsof (open fds / pipes) ---",
    lsofRes.ok ? clamp(lsofRes.stdout) : "(unavailable — see failures)",
    "",
    `--- [4] op marker (${markerPath}) ---`,
    clamp(markerText),
    "",
    "--- check-progress: not captured by design; read `./singularity check --status`",
    `    and correlate on pid=${req.pid} / startedAt=${req.startedAt}. See capture.ts.`,
    "",
  ].join("\n");

  try {
    sink.append(body);
  } catch (err) {
    // The dump is the deliverable, so a write failure must be visible in the
    // returned result — `dumpPath` would otherwise point at a file that does not
    // contain this capture at all.
    fail("dump-write", `${sink.path}: ${String(err)}`);
  }

  return { dumpPath: sink.path, alive, cpu, specimen, children, failures };
}
