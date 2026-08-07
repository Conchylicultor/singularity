import type { EditedFile } from "@plugins/conversations/plugins/conversation-view/plugins/code/core";
import { useEndpoint, EndpointError } from "@plugins/infra/plugins/endpoints/web";
import { getCommitFiles } from "@plugins/code-explorer/plugins/code-api/core";

export type CommitFiles = {
  files: EditedFile[];
  baseSha: string;
  headSha: string;
};

export type CommitFilesState =
  | { kind: "loading" }
  | { kind: "ok"; data: CommitFiles }
  | { kind: "error"; message: string };

export function useCommitFiles(worktree: string, sha: string): CommitFilesState {
  const { data, isLoading, error } = useEndpoint(
    getCommitFiles,
    { worktree },
    { query: { sha } },
  );

  // `isLoading` is true only while the current (worktree, sha) key has no cached
  // data, matching the prior per-input loading reset.
  if (isLoading || (!data && !error)) return { kind: "loading" };
  if (error) {
    return {
      kind: "error",
      message:
        error instanceof EndpointError ? `HTTP ${error.status}` : String(error),
    };
  }
  return { kind: "ok", data: data! };
}
