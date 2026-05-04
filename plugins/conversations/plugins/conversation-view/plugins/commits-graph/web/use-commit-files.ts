import { useEffect, useState } from "react";
import type { EditedFile } from "@plugins/conversations/plugins/conversation-view/plugins/code/shared";

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
    fetch(
      `/api/code/${encodeURIComponent(worktree)}/commit?sha=${encodeURIComponent(sha)}`,
    )
      .then(async (res) => {
        if (cancelled) return;
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          setState({ kind: "error", message: text || res.statusText });
          return;
        }
        const data = (await res.json()) as CommitFiles;
        setState({ kind: "ok", data });
      })
      .catch((err) => {
        if (cancelled) return;
        setState({ kind: "error", message: String(err) });
      });
    return () => {
      cancelled = true;
    };
  }, [worktree, sha]);

  return state;
}
