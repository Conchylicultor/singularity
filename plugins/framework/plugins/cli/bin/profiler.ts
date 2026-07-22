import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import { worktreeDataDir, worktreeArtifacts, pruneWorktreeBuildArtifacts } from "./paths";
import { buildProgressSpanStart, buildProgressSpanEnd } from "./build-progress";

export interface BuildSpan {
  id: string;
  phase: string;
  label: string;
  startMs: number;
  durationMs: number;
  /**
   * Peak RSS (bytes) of the subprocess this span wrapped, when one was
   * measured (exec/execBuffered in build.ts). Calibration input for the build
   * pool's memory budget (host-semaphore.ts).
   */
  maxRssBytes?: number;
}

export interface BuildProfile {
  spans: BuildSpan[];
  totalDurationMs: number;
}

/**
 * A single build's span accumulator + writer. One collector owns one `spans[]`
 * and its own `t0` baseline, so a collector created later re-bases `startMs` to
 * its own creation instant — a composition's spans start at 0 relative to the
 * composition, not the parent build. Callers in main use the module-default
 * instance via the wrapper exports below.
 */
export interface SpanCollector {
  start(id: string, phase: string, label: string): (extra?: { maxRssBytes?: number }) => void;
  push(id: string, phase: string, label: string, durationMs: number, wallStartMs?: number): void;
  /** Writes `build-profile-<runId>.json` under worktree `name`. */
  write(name: string, runId: string): void;
}

// Per-span unique token feeding the durable build-progress log. The human `id`
// can repeat across concurrent spans (web artifacts / checks run in parallel), so
// the progress log is keyed on this monotonic counter, never on `id`. Module-global
// on purpose: every collector's `start()` emits progress markers under the parent
// pid, so a composition span stays visible in the one durable build-progress log.
let spanSeq = 0;

interface SpanCollectorInternal extends SpanCollector {
  /**
   * Broader write accepting the id-less (`undefined`) case, so the module-default
   * collector can still produce the unsuffixed `build-profile.json` for a manual
   * CLI build with no SINGULARITY_BUILD_ID.
   */
  writeProfile(name: string, buildId: string | undefined): void;
}

function makeSpanCollector(): SpanCollectorInternal {
  const t0 = performance.now();
  const spans: BuildSpan[] = [];

  function writeProfile(name: string, buildId: string | undefined): void {
    const profile: BuildProfile = {
      spans,
      totalDurationMs:
        spans.length === 0
          ? 0
          : Math.max(...spans.map((s) => s.startMs + s.durationMs)),
    };
    const dir = worktreeDataDir(name);
    mkdirSync(dir, { recursive: true });
    const path = worktreeArtifacts.buildProfile(name, buildId);
    const tmp = `${path}.tmp.${process.pid}`;
    writeFileSync(tmp, JSON.stringify(profile, null, 2) + "\n");
    renameSync(tmp, path);
    // Trim old per-build artifact sets now that this build's set is on disk (the leak
    // fix). See pruneWorktreeBuildArtifacts: the just-written files are always retained.
    pruneWorktreeBuildArtifacts(name);
  }

  return {
    start(id, phase, label) {
      const start = performance.now();
      // Durable, synchronous `enter` marker — on disk before the span body runs, so a
      // build that wedges inside it is named even after SIGKILL. The in-memory `spans`
      // array below is flushed only by write() at the very end, which a wedged build
      // never reaches; this is the crash-durable twin.
      const token = ++spanSeq;
      buildProgressSpanStart(token, id, phase, label);
      return (extra) => {
        const durationMs = Math.round(performance.now() - start);
        spans.push({
          id,
          phase,
          label,
          startMs: Math.round(start - t0),
          durationMs,
          ...(extra?.maxRssBytes != null ? { maxRssBytes: extra.maxRssBytes } : {}),
        });
        buildProgressSpanEnd(token, id, durationMs);
      };
    },
    push(id, phase, label, durationMs, wallStartMs) {
      const startMs =
        wallStartMs != null
          ? Math.round(wallStartMs - t0)
          : Math.round(performance.now() - t0) - durationMs;
      spans.push({ id, phase, label, startMs, durationMs });
    },
    write(name, runId) {
      writeProfile(name, runId);
    },
    writeProfile,
  };
}

export function createSpanCollector(): SpanCollector {
  return makeSpanCollector();
}

// The module-default collector backing the legacy wrappers below, so every current
// caller (build.ts, admission-valve.ts) is byte-for-byte unaffected.
const defaultCollector = makeSpanCollector();

export function buildProfilerStart(
  id: string,
  phase: string,
  label: string,
): (extra?: { maxRssBytes?: number }) => void {
  return defaultCollector.start(id, phase, label);
}

export function pushBuildSpan(
  id: string,
  phase: string,
  label: string,
  durationMs: number,
  wallStartMs?: number,
): void {
  defaultCollector.push(id, phase, label, durationMs, wallStartMs);
}

export function writeBuildProfile(name: string): void {
  defaultCollector.writeProfile(name, process.env.SINGULARITY_BUILD_ID);
}
