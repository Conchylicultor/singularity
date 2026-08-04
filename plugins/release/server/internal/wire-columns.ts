import { _releaseRuns } from "./tables";

/**
 * The public projection of `release_runs`: every column EXCEPT `pid`, which is
 * an internal liveness marker and never part of `ReleaseRun`.
 *
 * ONE spelling, shared by every read path (the per-id detail resource, the
 * keyset history query, the candidate endpoint). Each of those parses its rows
 * through `ReleaseRunSchema`, so a column present in the schema and missing from
 * a hand-copied projection is a runtime parse failure on exactly the surface
 * that forgot it — which is what happened with `commitSha`/`commitDirty` and
 * would happen again with every future column. Adding a column here reaches all
 * three at once.
 */
export const RELEASE_RUN_WIRE_COLUMNS = {
  id: _releaseRuns.id,
  composition: _releaseRuns.composition,
  target: _releaseRuns.target,
  namespace: _releaseRuns.namespace,
  kind: _releaseRuns.kind,
  status: _releaseRuns.status,
  startedAt: _releaseRuns.startedAt,
  finishedAt: _releaseRuns.finishedAt,
  exitCode: _releaseRuns.exitCode,
  platform: _releaseRuns.platform,
  artifactPath: _releaseRuns.artifactPath,
  port: _releaseRuns.port,
  commitSha: _releaseRuns.commitSha,
  commitDirty: _releaseRuns.commitDirty,
  error: _releaseRuns.error,
} as const;
