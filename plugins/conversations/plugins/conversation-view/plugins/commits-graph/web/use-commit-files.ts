import { useEffect, useState } from "react";
import type { EditedFile } from "@plugins/conversations/plugins/conversation-view/plugins/code/core";
import { fetchEndpoint, EndpointError } from "@plugins/infra/plugins/endpoints/web";
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
  const [state, setState] = useState<CommitFilesState>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    setState({ kind: "loading" });
    fetchEndpoint(getCommitFiles, { worktree }, { query: { sha } })
      .then((data) => {
        if (cancelled) return;
        setState({ kind: "ok", data });
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof EndpointError) {
          setState({ kind: "error", message: `HTTP ${err.status}` });
        } else {
          setState({ kind: "error", message: String(err) });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [worktree, sha]);

  return state;
}
