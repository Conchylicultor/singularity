import { useEndpoint, EndpointError } from "@plugins/infra/plugins/endpoints/web";
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
  const { data, error } = useEndpoint(
    getFileDiff,
    { worktree },
    { query: { path, base, head, from } },
  );

  if (data) return { kind: "ok", diff: data.diff };
  if (error) {
    if (error instanceof EndpointError) {
      return {
        kind: "error",
        status: error.status,
        message: typeof error.body === "string" ? error.body : `HTTP ${error.status}`,
      };
    }
    return { kind: "error", status: 0, message: String(error) };
  }
  // No data, no error → still loading. (A query-key change refetch keeps prior
  // data, so that case lands in the `data` branch above, not here.)
  return { kind: "loading" };
}
