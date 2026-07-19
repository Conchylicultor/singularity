export { checkCollectedDir } from "./collected-dir";
export { runChecks, listAllChecks, scopeOf } from "./runner";
export type { RunChecksOptions } from "./runner";
export { discoverTscTargets, tsBuildInfoPath } from "./discover";
export type { TscTarget } from "./discover";
export { materializeWarmBase, publishWarmBase } from "./warm-base";
export { computeTreeHash } from "./tree-hash";
export { openCheckCache } from "./cache";
export type { CheckCache } from "./cache";
export { readCheckProgress } from "./progress-log";
export type { CheckRunProgress, OutstandingCheck, ProgressRecord } from "./progress-log";
export { loadTreeSnapshot, validate, fingerprint, computeCheckSourceHash } from "./read-set";
export type {
  TreeSnapshot,
  FileSystemView,
  ReadSet,
  FileFact,
  DirFact,
  GlobFact,
  QueryFact,
  ValidateResult,
  ValidateOptions,
} from "./read-set";
export { currentScanView } from "./scan-context";
export { grepCode, grepImports, listCandidateSources, gitGrepList } from "./grep-code";
export { isBuildInProgress, markBuildInProgress } from "./run-context";
export type { CodeMatch, ImportMatch, CandidateSource, ListCandidateSourcesOptions } from "./grep-code";
// NOTE: token-group-vars.generated.ts is intentionally NOT re-exported. Checks
// must read token-group vars FRESH via codegen core's collectTokenGroupVars() —
// a static import of the generated manifest is frozen in the ESM module cache
// before codegen rewrites the file in the same build, which made token-var
// renames pass only on the second build. The committed file remains a
// reviewable, token-group-vars-in-sync-guarded snapshot.
