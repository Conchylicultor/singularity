import { useEndpoint } from "@plugins/infra/plugins/endpoints/web";
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
  const { data, isLoading, error } = useEndpoint(
    resolveFile,
    { worktree },
    { query: { path } },
  );

  // No data for the current (worktree, path) key yet → still resolving. A
  // failed resolve is treated as "not found" (the prior cancel-flag effect did
  // the same), so any error collapses to the not-found branch.
  if (isLoading || (!data && !error)) return { status: "loading" };
  if (!data) return { status: "not-found" };

  if (data.kind === "exact") return { status: "exact", path };
  if (data.kind === "resolved") {
    return data.matches.length === 1
      ? { status: "resolved", path: data.matches[0]! }
      : { status: "ambiguous", matches: data.matches };
  }
  return { status: "not-found" };
}
