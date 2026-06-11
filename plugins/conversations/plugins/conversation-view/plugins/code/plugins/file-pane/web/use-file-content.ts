import { useEffect, useState } from "react";
import { fetchEndpoint, EndpointError } from "@plugins/infra/plugins/endpoints/web";
import { getFileContent } from "@plugins/code-explorer/plugins/code-api/core";

export type FileContentState =
  | { kind: "loading" }
  | { kind: "ok"; content: string }
  | { kind: "error"; status: number; message: string };

export function useFileContent(
  worktree: string,
  path: string,
): FileContentState {
  const [state, setState] = useState<FileContentState>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    setState({ kind: "loading" });
    fetchEndpoint(getFileContent, { worktree }, { query: { path } })
      .then(({ content }) => {
        if (cancelled) return;
        setState({ kind: "ok", content });
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof EndpointError) {
          setState({
            kind: "error",
            status: err.status,
            message:
              typeof err.body === "string"
                ? err.body
                : `HTTP ${err.status}`,
          });
        } else {
          setState({ kind: "error", status: 0, message: String(err) });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [worktree, path]);

  return state;
}
