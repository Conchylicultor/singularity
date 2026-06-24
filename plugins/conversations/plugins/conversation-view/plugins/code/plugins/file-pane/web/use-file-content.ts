import { useEndpoint, EndpointError } from "@plugins/infra/plugins/endpoints/web";
import { getFileContent } from "@plugins/code-explorer/plugins/code-api/core";

export type FileContentState =
  | { kind: "loading" }
  | { kind: "ok"; content: string }
  | { kind: "error"; status: number; message: string };

export function useFileContent(
  worktree: string,
  path: string,
): FileContentState {
  const { data, isLoading, error } = useEndpoint(
    getFileContent,
    { worktree },
    { query: { path } },
  );

  // Map the query result onto the existing FileContentState union: consumers
  // branch on `state.status` (404/413/415), so the EndpointError status must be
  // preserved. `isLoading` is true only while the current (worktree, path) key
  // has no cached data, matching the prior per-input loading reset.
  if (isLoading || (!data && !error)) return { kind: "loading" };
  if (error) {
    if (error instanceof EndpointError) {
      return {
        kind: "error",
        status: error.status,
        message:
          typeof error.body === "string" ? error.body : `HTTP ${error.status}`,
      };
    }
    return { kind: "error", status: 0, message: String(error) };
  }
  return { kind: "ok", content: data!.content };
}
