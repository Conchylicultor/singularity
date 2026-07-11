import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import { worktreeDataDir, worktreeArtifacts, pruneWorktreeBuildArtifacts } from "./paths";

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

const t0 = performance.now();
const spans: BuildSpan[] = [];

export function buildProfilerStart(
  id: string,
  phase: string,
  label: string,
): (extra?: { maxRssBytes?: number }) => void {
  const start = performance.now();
  return (extra) => {
    spans.push({
      id,
      phase,
      label,
      startMs: Math.round(start - t0),
      durationMs: Math.round(performance.now() - start),
      ...(extra?.maxRssBytes != null ? { maxRssBytes: extra.maxRssBytes } : {}),
    });
  };
}

export function pushBuildSpan(
  id: string,
  phase: string,
  label: string,
  durationMs: number,
  wallStartMs?: number,
): void {
  const startMs =
    wallStartMs != null
      ? Math.round(wallStartMs - t0)
      : Math.round(performance.now() - t0) - durationMs;
  spans.push({ id, phase, label, startMs, durationMs });
}

export function writeBuildProfile(name: string): void {
  const profile: BuildProfile = {
    spans,
    totalDurationMs:
      spans.length === 0
        ? 0
        : Math.max(...spans.map((s) => s.startMs + s.durationMs)),
  };
  const dir = worktreeDataDir(name);
  mkdirSync(dir, { recursive: true });
  const buildId = process.env.SINGULARITY_BUILD_ID;
  const path = worktreeArtifacts.buildProfile(name, buildId);
  const tmp = `${path}.tmp.${process.pid}`;
  writeFileSync(tmp, JSON.stringify(profile, null, 2) + "\n");
  renameSync(tmp, path);
  // Trim old per-build artifact sets now that this build's set is on disk (the leak
  // fix). See pruneWorktreeBuildArtifacts: the just-written files are always retained.
  pruneWorktreeBuildArtifacts(name);
}
