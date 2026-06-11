import { useEffect, useState } from "react";
import { fetchEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { resolveFile } from "../../shared/endpoints";

export type ResolvedFileState =
  | { status: "loading" }
  | { status: "exact"; path: string }
  | { status: "resolved"; path: string }
  | { status: "ambiguous"; matches: string[] }
  | { status: "not-found" };

export function useResolvedFile(
  worktree: string,
  path: string,
): ResolvedFileState {
  const [state, setState] = useState<ResolvedFileState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    fetchEndpoint(resolveFile, { worktree }, { query: { path } })
      .then((result) => {
        if (cancelled) return;
        if (result.kind === "exact") {
          setState({ status: "exact", path });
        } else if (result.kind === "resolved") {
          if (result.matches.length === 1) {
            setState({ status: "resolved", path: result.matches[0]! });
          } else {
            setState({ status: "ambiguous", matches: result.matches });
          }
        } else {
          setState({ status: "not-found" });
        }
      })
      .catch(() => {
        if (cancelled) return;
        setState({ status: "not-found" });
      });
    return () => {
      cancelled = true;
    };
  }, [worktree, path]);

  return state;
}
