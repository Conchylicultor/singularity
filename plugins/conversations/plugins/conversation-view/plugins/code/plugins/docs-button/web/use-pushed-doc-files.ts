import { useEffect, useMemo, useState } from "react";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { fetchEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { getPushFiles } from "@plugins/code-explorer/plugins/code-api/core";
import { pushesResource } from "@plugins/tasks/plugins/tasks-core/core";
import type { EditedFile } from "@plugins/conversations/plugins/conversation-view/plugins/code/core";
import { isDocFile } from "./panes";

/** Returns all .md/.mdx files changed in any push for the given attempt, deduped by path. Null while loading. */
export function usePushedDocFiles(attemptId: string): EditedFile[] | null {
  const pushesQ = useResource(pushesResource);
  const [result, setResult] = useState<{ key: string; files: EditedFile[] } | null>(null);

  const pushIdsKey = useMemo(() => {
    if (pushesQ.pending) return null;
    const ids = new Set<string>();
    for (const r of pushesQ.data) {
      if (r.attemptId === attemptId) ids.add(r.pushId);
    }
    return [...ids].sort().join(",");
  }, [pushesQ, attemptId]);

  useEffect(() => {
    if (pushIdsKey === null) return;
    const ids = pushIdsKey ? pushIdsKey.split(",") : [];
    /* eslint-disable react-hooks/set-state-in-effect -- async fan-out: a single useResource/useEndpoint cannot express the Promise.all over a dynamic set of push ids merged & deduped by path; the cancelled-flag guard makes the late setResult safe. */
    if (ids.length === 0) {
      setResult({ key: "", files: [] });
      return;
    }

    let cancelled = false;
    void Promise.all(
      ids.map((pushId) =>
        // eslint-disable-next-line reactive-server-io/no-reactive-server-io, promise-safety/no-absorbed-failure -- read-only per-tab view refresh on live-state change (no cross-tab write to deduplicate); the .catch(() => []) is a best-effort per-push doc-file probe whose failure just omits that push's chips from this tab's display, never a shared data decision
        fetchEndpoint(getPushFiles, { worktree: "main" }, { query: { pushId } })
          .then((data) => data.files.filter((f) => isDocFile(f.path)))
          .catch(() => [] as EditedFile[]),
      ),
    ).then((allFiles) => {
      if (cancelled) return;
      const byPath = new Map<string, EditedFile>();
      for (const files of allFiles) {
        for (const f of files) byPath.set(f.path, f);
      }
      setResult({ key: pushIdsKey, files: [...byPath.values()] });
    });
    /* eslint-enable react-hooks/set-state-in-effect */

    return () => {
      cancelled = true;
    };
  }, [pushIdsKey]);

  if (pushIdsKey === null) return null;
  if (pushIdsKey === "") return [];
  if (result?.key !== pushIdsKey) return null;
  return result.files;
}
