import { useQuery } from "@tanstack/react-query";
import {
  fetchEndpoint,
  getEndpointErrorMessage,
} from "@plugins/infra/plugins/endpoints/web";
import {
  HOST_FS_PEEK_MAX_PATHS,
  hostFsPeek,
  type HostFsPeekResult,
} from "@plugins/infra/plugins/host-fs/core";
import { yieldMacrotask } from "@plugins/packages/plugins/macrotask-yield/core";

type Waiter = {
  resolve: (result: HostFsPeekResult) => void;
  reject: (err: unknown) => void;
};

/** Paths asked for since the last flush, each with whoever is waiting on it. */
let pending = new Map<string, Waiter[]>();
let flushing = false;

/**
 * Send every path asked for this macrotask as one `peek` (chunked to the
 * endpoint's cap). The rows a window mounts in one commit ask together, so a
 * screenful of folders is one request, not one per folder.
 */
async function flush(): Promise<void> {
  await yieldMacrotask();
  const batch = pending;
  pending = new Map();
  flushing = false;
  const paths = [...batch.keys()];
  for (let i = 0; i < paths.length; i += HOST_FS_PEEK_MAX_PATHS) {
    const chunk = paths.slice(i, i + HOST_FS_PEEK_MAX_PATHS);
    try {
      const { results } = await fetchEndpoint(
        hostFsPeek,
        {},
        { body: { paths: chunk } },
      );
      chunk.forEach((path, j) => {
        for (const w of batch.get(path)!) w.resolve(results[j]!);
      });
    } catch (err) {
      for (const path of chunk) for (const w of batch.get(path)!) w.reject(err);
    }
  }
}

function peekBatched(path: string): Promise<HostFsPeekResult> {
  return new Promise((resolve, reject) => {
    const waiters = pending.get(path);
    if (waiters === undefined) pending.set(path, [{ resolve, reject }]);
    else waiters.push({ resolve, reject });
    if (!flushing) {
      flushing = true;
      void flush();
    }
  });
}

/** A folder's peek as its cell holds it. */
export type FolderPeek =
  | { kind: "pending" }
  | { kind: "ok"; result: HostFsPeekResult }
  | { kind: "failed"; message: string; retry: () => void };

/**
 * What the folder at `path` holds, by name — asked for by the folder's own
 * cell, so only folders on screen are read (the tree windows its rows), and
 * not at all while `enabled` is false (an expanded folder counts its listing).
 * Cached for the tree's `visit`: scrolling back is free, a new visit re-reads.
 */
export function useFolderPeek(
  path: string,
  visit: string,
  enabled: boolean,
): FolderPeek {
  const query = useQuery({
    queryKey: ["file-explorer.peek", visit, path],
    queryFn: () => peekBatched(path),
    enabled,
    staleTime: Infinity,
  });
  if (query.data !== undefined) return { kind: "ok", result: query.data };
  if (query.isError) {
    return {
      kind: "failed",
      message: getEndpointErrorMessage(query.error),
      retry: () => void query.refetch(),
    };
  }
  return { kind: "pending" };
}
