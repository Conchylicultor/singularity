// `core/` here means RUNTIME-NEUTRAL NODE, not web-safe: this barrel reaches
// `node:fs` / `node:path`. It exists so the two sides of the generated-artifact
// normalize contract — the CLI that PERFORMS it (`bin/git/normalize-generated`,
// `push`, `build`) and the check that ASSERTS it
// (`tooling/plugins/checks/plugins/generated-artifacts-normalized`) — read the
// same marker names, git-dir resolution, and conflict scan instead of each
// hand-rolling them. Never import this from `web/`.

export { resolveGitDir } from "./internal/git-dir";
export {
  MERGE_MARKER_KINDS,
  mergeMarkerDir,
  readMergeMarkers,
  clearMergeMarkers,
} from "./internal/merge-markers";
export type { MergeMarkerKind } from "./internal/merge-markers";
export { findClaudeMdConflicts } from "./internal/claudemd-conflicts";
