export { checkCollectedDir } from "./collected-dir";
export { runChecks, listAllChecks, scopeOf } from "./runner";
export type { RunChecksOptions } from "./runner";
export { discoverTscTargets, tsBuildInfoPath } from "./discover";
export type { TscTarget } from "./discover";
export { computeTreeHash } from "./tree-hash";
export { openCheckCache } from "./cache";
export type { CheckCache } from "./cache";
export { grepCode, grepImports, listCandidateSources } from "./grep-code";
export { isBuildInProgress, markBuildInProgress } from "./run-context";
export type { CodeMatch, ImportMatch, CandidateSource, ListCandidateSourcesOptions } from "./grep-code";
// NOTE: token-group-vars.generated.ts is intentionally NOT re-exported. Checks
// must read token-group vars FRESH via codegen core's collectTokenGroupVars() —
// a static import of the generated manifest is frozen in the ESM module cache
// before codegen rewrites the file in the same build, which made token-var
// renames pass only on the second build. The committed file remains a
// reviewable, token-group-vars-in-sync-guarded snapshot.
