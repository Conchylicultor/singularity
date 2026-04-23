import { useEffect, useState } from "react";

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
    const url = `/api/code/${encodeURIComponent(worktree)}/file?path=${encodeURIComponent(path)}`;
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
        const body = (await res.json()) as { content: string };
        setState({ kind: "ok", content: body.content });
      })
      .catch((err) => {
        if (cancelled) return;
        setState({ kind: "error", status: 0, message: String(err) });
      });
    return () => {
      cancelled = true;
    };
  }, [worktree, path]);

  return state;
}
