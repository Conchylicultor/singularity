import type { CommitRow } from "@plugins/primitives/plugins/commit-list/core";
import { useEndpoint, EndpointError } from "@plugins/infra/plugins/endpoints/web";
import { getCommitInfo } from "@plugins/code-explorer/plugins/code-api/core";

/**
 * `not-found` and `error` are separate arms on purpose: the server answering
 * "this sha names no object in that worktree" (a `Resolvable` non-value, over a
 * 200) is a determinate fact about the repository, while a transport failure is
 * an absence of any answer. Folding the second into the first would let a dead
 * backend read as "that commit doesn't exist".
 */
export type CommitInfoState =
  | { kind: "loading" }
  | { kind: "found"; commit: CommitRow }
  | { kind: "not-found"; reason: string }
  | { kind: "error"; message: string };

export function useCommitInfo(worktree: string, sha: string): CommitInfoState {
  const { data, isLoading, error } = useEndpoint(
    getCommitInfo,
    { worktree },
    // Commit metadata is immutable, so one fetch per distinct (worktree, sha)
    // per session, shared by every consumer of this hook.
    { query: { sha }, staleTime: Infinity },
  );

  if (error) {
    return {
      kind: "error",
      message:
        error instanceof EndpointError ? `HTTP ${error.status}` : String(error),
    };
  }
  if (isLoading || !data) return { kind: "loading" };
  return data.resolved
    ? { kind: "found", commit: data.value }
    : { kind: "not-found", reason: data.reason };
}
