import { lstat } from "node:fs/promises";
import { resolve } from "node:path";
import { defineExternalResource } from "@plugins/framework/plugins/server-core/core";
import { runGit } from "@plugins/primitives/plugins/commit-list/server";
import { getConversation } from "@plugins/tasks/plugins/tasks-core/server";
import { EditedFilesPayloadSchema } from "../../core/protocol";
import { getEditedFiles } from "./get-edited-files";
import { type DirtyEntry, editedFilesEtag, parsePorcelainZ } from "./edited-files-etag";
import { watchEditedFiles } from "./watch-edited-files";

type Params = { id: string };

// lstat one dirty path for its (mtime, size) — git's stat-cache dirty signal.
// A deleted/vanished path (status "D", or a race) can't be stat'd; ENOENT is the
// expected case there, so we degrade to -1 sentinels (which still flip the ETag on
// a present→deleted transition — the porcelain code changes too). Any OTHER error
// is unexpected and re-thrown so it fails loudly rather than serving a signature
// built on a silent read failure.
async function statEntry(
  worktreePath: string,
  entry: { code: string; path: string },
): Promise<DirtyEntry> {
  try {
    const st = await lstat(resolve(worktreePath, entry.path));
    return { code: entry.code, path: entry.path, mtimeMs: st.mtimeMs, size: st.size };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    return { code: entry.code, path: entry.path, mtimeMs: -1, size: -1 };
  }
}

const unsubscribes = new Map<string, () => void>();

async function worktreeFor(conversationId: string): Promise<string | null> {
  const row = await getConversation(conversationId);
  return row?.worktreePath ?? null;
}

export const editedFilesResource = defineExternalResource({
  key: "edited-files",
  mode: "invalidate",
  schema: EditedFilesPayloadSchema,
  loader: async ({ id }: Params) => {
    const wt = await worktreeFor(id);
    if (!wt) return [];
    return getEditedFiles(wt);
  },
  // Cheap ETag: covers both halves of the edited-files value. (headSha, mergeBase)
  // covers the committed branch diff (immutable trees — a porcelain-only signature
  // would miss an amend/rebase that leaves the working tree clean). The per-dirty
  // -file (code, lstat mtimeMs+size) covers the uncommitted working-tree changes
  // AND their line counts — a file already `M` gaining more edits keeps its
  // porcelain code but changes its mtime/size. Over-approximation: an mtime touch
  // with no content change forces a needless recompute (acceptable). No worktree ⇒
  // "none". Cost: 1 `rev-parse` + 1 `merge-base` + 1 `git status` + an `lstat` per
  // dirty file, vs. the loader's `merge-base` + two `git diff` passes + full
  // content reads of untracked files.
  revalidate: async ({ id }: Params): Promise<string> => {
    const wt = await worktreeFor(id);
    if (!wt) return "none";
    const [headSha, mergeBaseRaw, statusZ] = await Promise.all([
      runGit(["rev-parse", "HEAD"], wt),
      runGit(["merge-base", "main", "HEAD"], wt),
      runGit(["status", "--porcelain", "--no-renames", "--untracked-files=all", "-z"], wt),
    ]);
    // Mirror the loader's merge-base fallback so the ETag agrees with the value.
    const mergeBase = mergeBaseRaw?.trim() ?? "main";
    const entries = await Promise.all(
      parsePorcelainZ(statusZ).map((e) => statEntry(wt, e)),
    );
    return editedFilesEtag(headSha ?? "", mergeBase, entries);
  },
  async onFirstSubscribe({ id }: Params) {
    if (unsubscribes.has(id)) return;
    const wt = await worktreeFor(id);
    if (!wt) return;
    let first = true;
    const unsub = watchEditedFiles(wt, () => {
      if (first) {
        first = false;
        return;
      }
      editedFilesResource.notify({ id });
    });
    unsubscribes.set(id, unsub);
  },
  onLastUnsubscribe({ id }: Params) {
    unsubscribes.get(id)?.();
    unsubscribes.delete(id);
  },
});
