import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { getConfig } from "@plugins/config_v2/server";
import { currentWorktreeName, worktreeDataDir } from "@plugins/infra/plugins/paths/server";
import { Log, type LogChannel } from "@plugins/primitives/plugins/log-channels/server";
import { pagingProbeConfig } from "../../core";
import { PROBE_VARIANTS, type ProbeVariant } from "../../core/probe-logic";

// Main-side supervisor for the twin probes: one child process per variant,
// respawned with capped backoff and a rapid-failure give-up. Mirrors
// sentinel/server/internal/worker-host.ts in shape; the differences are
// deliberate: N independent children instead of one Worker, and there is no
// vendored-release path — the probes are main-dev-only (server/index.ts gates
// on isMain() && !isRelease()), so `bun …/probe/entry.ts` always resolves from
// source.

/** Respawn backoff after a probe death: start here, double up to the cap. */
const RESPAWN_BACKOFF_MIN_MS = 1_000;
const RESPAWN_BACKOFF_MAX_MS = 30_000;
/**
 * A probe that dies this fast never got going (e.g. the entry fails to resolve).
 * After MAX_RAPID_FAILURES such deaths in a row, give up with one loud line
 * instead of respawn-looping forever.
 */
const RAPID_EXIT_MS = 2_000;
const MAX_RAPID_FAILURES = 5;

interface ChildState {
  variant: ProbeVariant;
  proc: Bun.Subprocess | null;
  stopping: boolean;
  respawnTimer: ReturnType<typeof setTimeout> | null;
  backoffMs: number;
  rapidFailures: number;
  spawnedAt: number;
}

interface HostState {
  channel: LogChannel;
  children: ChildState[];
}

let state: HostState | null = null;

// The sibling probe/entry.ts, resolved from this file's on-disk location; the
// probes never run in a compiled release, so no vendoring.
function probeEntryPath(): string {
  return join(import.meta.dir, "probe", "entry.ts");
}

function logsDir(): string {
  return join(worktreeDataDir(currentWorktreeName()), "logs");
}

function outPathFor(variant: ProbeVariant): string {
  return join(logsDir(), `paging-probe-${variant}.jsonl`);
}

// Drain a child's stderr line-by-line into the paging-probe log channel so its
// degradation / lifecycle lines are durable and readable while the box is
// wedged. stdout is ignored — the probe writes its samples to the JSONL file
// directly and prints nothing to stdout. Fire-and-forget (void): the reader ends
// when the child exits and the stream closes.
function pipeStderr(host: HostState, child: ChildState, stream: ReadableStream<Uint8Array>): void {
  void (async () => {
    const decoder = new TextDecoder();
    let buffer = "";
    try {
      // Cast to AsyncIterable: the DOM lib's ReadableStream lacks the
      // async-iterator declaration Bun provides at runtime (repo precedent:
      // build/server/internal/run-build.ts streamLines).
      for await (const chunk of stream as unknown as AsyncIterable<Uint8Array>) {
        buffer += decoder.decode(chunk, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (line.length > 0) host.channel.publish(`[${child.variant}] ${line}`);
        }
      }
      if (buffer.length > 0) host.channel.publish(`[${child.variant}] ${buffer}`);
    } catch (err) {
      host.channel.publish(`[${child.variant}] stderr read error: ${String(err)}`);
    }
  })();
}

function scheduleRespawn(host: HostState, child: ChildState): void {
  if (child.stopping || child.respawnTimer) return;
  const rapid = Date.now() - child.spawnedAt < RAPID_EXIT_MS;
  if (rapid) {
    child.rapidFailures += 1;
  } else {
    // Ran past the rapid-exit window before dying — treat as a healthy run and
    // reset both the give-up counter and the backoff (worker-host resets these
    // on the worker's `ready` frame; a probe has no such frame, so survival past
    // RAPID_EXIT_MS is the healthy signal).
    child.rapidFailures = 0;
    child.backoffMs = RESPAWN_BACKOFF_MIN_MS;
  }
  if (child.rapidFailures >= MAX_RAPID_FAILURES) {
    // Loud give-up, not a silent absence: this probe variant is down until the
    // underlying cause is fixed.
    host.channel.publish(
      `probe '${child.variant}' died ${String(MAX_RAPID_FAILURES)} times within ${String(RAPID_EXIT_MS)}ms of spawn — giving up. This probe variant is NOT running.`,
    );
    return;
  }
  host.channel.publish(
    `probe '${child.variant}' exited — respawning in ${String(child.backoffMs)}ms`,
  );
  child.respawnTimer = setTimeout(() => {
    child.respawnTimer = null;
    if (!child.stopping) spawnChild(host, child);
  }, child.backoffMs);
  child.backoffMs = Math.min(child.backoffMs * 2, RESPAWN_BACKOFF_MAX_MS);
}

function spawnChild(host: HostState, child: ChildState): void {
  const cfg = getConfig(pagingProbeConfig);
  // NOT wrapped in backgroundArgv / darwinbg and NOT demoted: the fair twin is a
  // DEFAULT-QoS process — the symptom under test is that normal, un-demoted apps
  // stay responsive while main freezes. boostQos (when set) is applied by the
  // child itself via a copied pthread FFI; a parent cannot set a child's QoS.
  const proc = Bun.spawn(
    [
      process.execPath,
      probeEntryPath(),
      child.variant,
      "--fat-size-mb",
      String(cfg.fatSizeMb),
      "--touch-slice-mb",
      String(cfg.touchSliceMb),
      "--gc-each-minute",
      cfg.gcEachMinute ? "1" : "0",
      "--boost-qos",
      cfg.boostQos ? "1" : "0",
      "--out",
      outPathFor(child.variant),
    ],
    {
      stdout: "ignore",
      stderr: "pipe",
      onExit: () => {
        if (child.proc === proc) child.proc = null;
        scheduleRespawn(host, child);
      },
    },
  );
  child.proc = proc;
  child.spawnedAt = Date.now();
  if (proc.stderr instanceof ReadableStream) pipeStderr(host, child, proc.stderr);
}

export function startPagingProbes(): void {
  if (state) return;
  const host: HostState = {
    channel: Log.channel("paging-probe", { persist: true }),
    children: PROBE_VARIANTS.map((variant) => ({
      variant,
      proc: null,
      stopping: false,
      respawnTimer: null,
      backoffMs: RESPAWN_BACKOFF_MIN_MS,
      rapidFailures: 0,
      spawnedAt: 0,
    })),
  };
  state = host;
  // The child probes write their JSONL directly via appendFileSync (no plugin
  // runtime, no Log.channel), which errors on a missing dir. On main the logs
  // dir already exists, but ensure it so a fresh box never spuriously trips the
  // rapid-failure give-up.
  mkdirSync(logsDir(), { recursive: true });
  for (const child of host.children) spawnChild(host, child);
}

export function stopPagingProbes(): void {
  const host = state;
  if (!host) return;
  state = null;
  for (const child of host.children) {
    child.stopping = true;
    if (child.respawnTimer) {
      clearTimeout(child.respawnTimer);
      child.respawnTimer = null;
    }
    // SIGTERM: the probe's handler clears its interval and exits 0.
    child.proc?.kill();
    child.proc = null;
  }
}
