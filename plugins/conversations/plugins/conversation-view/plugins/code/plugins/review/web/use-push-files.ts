import { useEffect, useState } from "react";
import type { EditedFile } from "@plugins/conversations/plugins/conversation-view/plugins/code/core";

export type PushFiles = {
  files: EditedFile[];
  baseSha: string;
  headSha: string;
};

export type PushFilesState =
  | { kind: "loading" }
  | { kind: "ok"; data: PushFiles }
  | { kind: "error"; message: string };

export function usePushFiles(pushId: string | null): PushFilesState {
  const [state, setState] = useState<PushFilesState>({ kind: "loading" });

  useEffect(() => {
    if (!pushId) {
      setState({ kind: "loading" });
      return;
    }
    let cancelled = false;
    setState({ kind: "loading" });
    fetch(`/api/code/main/push?pushId=${encodeURIComponent(pushId)}`)
      .then(async (res) => {
        if (cancelled) return;
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          setState({ kind: "error", message: text || res.statusText });
          return;
        }
        const data = (await res.json()) as PushFiles;
        setState({ kind: "ok", data });
      })
      .catch((err) => {
        if (cancelled) return;
        setState({ kind: "error", message: String(err) });
      });
    return () => {
      cancelled = true;
    };
  }, [pushId]);

  return state;
}
