import { useEffect, useState } from "react";
import { fetchEndpoint, EndpointError } from "@plugins/infra/plugins/endpoints/web";
import { getFileDiff } from "@plugins/code-explorer/plugins/code-api/core";

export type FileDiffState =
  | { kind: "loading" }
  | { kind: "ok"; diff: string }
  | { kind: "error"; status: number; message: string };

export function useFileDiff(
  worktree: string,
  path: string,
  base?: string,
  head?: string,
  from?: string,
): FileDiffState {
  const [state, setState] = useState<FileDiffState>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    setState({ kind: "loading" });
    fetchEndpoint(getFileDiff, { worktree }, { query: { path, base, head, from } })
      .then(({ diff }) => {
        if (cancelled) return;
        setState({ kind: "ok", diff });
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
  }, [worktree, path, base, head, from]);

  return state;
}
