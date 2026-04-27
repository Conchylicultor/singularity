import { useEffect, useState } from "react";

export type FileDiffState =
  | { kind: "loading" }
  | { kind: "ok"; diff: string }
  | { kind: "error"; status: number; message: string };

export function useFileDiff(
  worktree: string,
  path: string,
  base?: string,
  head?: string,
): FileDiffState {
  const [state, setState] = useState<FileDiffState>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    setState({ kind: "loading" });
    const baseQuery = base ? `&base=${encodeURIComponent(base)}` : "";
    const headQuery = head ? `&head=${encodeURIComponent(head)}` : "";
    const url = `/api/code/${encodeURIComponent(worktree)}/diff?path=${encodeURIComponent(path)}${baseQuery}${headQuery}`;
    fetch(url)
      .then(async (res) => {
        if (cancelled) return;
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          setState({
            kind: "error",
            status: res.status,
            message: text || res.statusText,
          });
          return;
        }
        const body = (await res.json()) as { diff: string };
        setState({ kind: "ok", diff: body.diff });
      })
      .catch((err) => {
        if (cancelled) return;
        setState({ kind: "error", status: 0, message: String(err) });
      });
    return () => {
      cancelled = true;
    };
  }, [worktree, path, base, head]);

  return state;
}
