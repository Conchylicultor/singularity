import type { EditedFile } from "@plugins/conversations/plugins/conversation-view/plugins/code/core";
import { useEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { getPushFiles } from "@plugins/code-explorer/plugins/code-api/core";

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
  const { data, isLoading, error } = useEndpoint(
    getPushFiles,
    { worktree: "main" },
    { query: { pushId: pushId ?? "" }, enabled: !!pushId },
  );

  if (!pushId || isLoading) return { kind: "loading" };
  if (error) return { kind: "error", message: String(error) };
  if (data) return { kind: "ok", data };
  return { kind: "loading" };
}
