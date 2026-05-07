import { useEffect, useState } from "react";

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
    const url = `/api/code/${encodeURIComponent(worktree)}/resolve?path=${encodeURIComponent(path)}`;
    fetch(url)
      .then(async (res) => {
        if (cancelled) return;
        if (!res.ok) {
          setState({ status: "not-found" });
          return;
        }
        const body = await res.json();
        if (body.kind === "exact") {
          setState({ status: "exact", path });
        } else if (body.kind === "resolved") {
          const matches = body.matches as string[];
          if (matches.length === 1) {
            setState({ status: "resolved", path: matches[0]! });
          } else {
            setState({ status: "ambiguous", matches });
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
