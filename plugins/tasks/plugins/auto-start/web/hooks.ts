import { useMemo } from "react";
import { usePointResources } from "@plugins/primitives/plugins/live-state/web";
import {
  taskAutoStartResource,
  type TaskAutoStartRow,
} from "../shared/resources";

export function useTaskAutoStart(
  taskId: string | null | undefined,
): TaskAutoStartRow | null {
  // `usePointResources` rather than `usePointResource`: this hook's signature is
  // nullish-tolerant and a hook cannot be called conditionally. An empty id set
  // encodes to `{ ids: "" }`, which the server's point loader short-circuits with
  // no query at all — the same free "nothing to ask about" arm the conversation
  // categories avatar uses.
  const ids = useMemo(() => (taskId ? [taskId] : []), [taskId]);
  const result = usePointResources(taskAutoStartResource, ids);
  if (result.pending) return null;
  return result.data[0] ?? null;
}
