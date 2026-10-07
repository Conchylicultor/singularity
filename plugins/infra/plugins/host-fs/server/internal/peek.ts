import { readdir } from "node:fs/promises";
import { implement } from "@plugins/infra/plugins/endpoints/server";
import {
  HOST_FS_PEEK_MAX_NAMES,
  hostFsPeek,
  type HostFsPeekResult,
} from "../../core";
import { locateHostDir } from "./archive/locate";
import { listArchiveDir } from "./archive/read";
import { classifyFsError, isHiddenName, resolveHostPath } from "./path";

/** How many folders one request reads at a time. */
const PEEK_CONCURRENCY = 8;

type Child = { name: string; hidden: boolean };

function named(path: string, names: readonly string[]): HostFsPeekResult {
  if (names.length > HOST_FS_PEEK_MAX_NAMES) {
    return { kind: "too-many", path, total: names.length };
  }
  return {
    kind: "ok",
    path,
    children: names.map((name): Child => ({
      name,
      hidden: isHiddenName(name),
    })),
  };
}

/**
 * What the absolute folder `path` holds, by name: one `readdir` on disk (a
 * symlink to a folder is read through), the cached index inside an archive.
 * An archive file on disk is never opened — it answers `archive`.
 */
export async function peekHostDir(path: string): Promise<HostFsPeekResult> {
  const located = await locateHostDir(path);
  if (located.kind === "archive") {
    if (located.inner === "") return { kind: "archive", path };
    const listed = await listArchiveDir(path, located);
    return listed.kind === "ok"
      ? named(
          path,
          listed.entries.map((e) => e.name),
        )
      : listed;
  }
  try {
    return named(path, await readdir(path));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOTDIR") {
      return { kind: "not-a-dir", path };
    }
    return { kind: classifyFsError(err), path };
  }
}

/** Peek every path, at most {@link PEEK_CONCURRENCY} at once, in order. */
export async function peekHostDirs(
  paths: readonly string[],
): Promise<HostFsPeekResult[]> {
  const results: HostFsPeekResult[] = new Array(paths.length);
  let next = 0;
  const worker = async () => {
    while (next < paths.length) {
      const i = next++;
      results[i] = await peekHostDir(paths[i]!);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(PEEK_CONCURRENCY, paths.length) }, worker),
  );
  return results;
}

export const handlePeek = implement(hostFsPeek, async ({ body }) => ({
  results: await peekHostDirs(body.paths.map((p) => resolveHostPath(p))),
}));
