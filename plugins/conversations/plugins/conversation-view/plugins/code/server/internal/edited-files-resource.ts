import { defineExternalResource } from "@plugins/framework/plugins/server-core/core";
import { getConversation } from "@plugins/tasks/plugins/tasks-core/server";
import { type EditedFile, EditedFilesPayloadSchema } from "../../core/protocol";
import { editedFilesMemo } from "./edited-files-cache";
import { getEditedFiles } from "./get-edited-files";
import { watchEditedFiles } from "./watch-edited-files";

type Params = { id: string };

const unsubscribes = new Map<string, () => void>();

async function worktreeFor(conversationId: string): Promise<string | null> {
  const row = await getConversation(conversationId);
  return row?.worktreePath ?? null;
}

// A conversation whose worktree we cannot resolve has an UNKNOWN file set, not an
// empty one. Returning `[]` (or a `"none"` ETag standing in for it) is an
// absorbable failure: the client renders a legitimate "no changes", which arms the
// destructive "Drop & Close". Both halves throw instead — `revalidate`'s throw is
// caught by the runtime's `computeEtag` (fail-safe → no short-circuit → full load)
// and the loader's throw reaches the client as a resource error, which the exit
// button renders as a non-destructive "Close (state unknown)".
function missingWorktree(conversationId: string): Error {
  return new Error(
    `edited-files: conversation ${conversationId} has no worktreePath — the edited-file set is unknown, not empty`,
  );
}

/** The `loader` half, resolved from a conversation id. */
export async function loadEditedFilesFor(conversationId: string): Promise<EditedFile[]> {
  const wt = await worktreeFor(conversationId);
  if (!wt) throw missingWorktree(conversationId);
  return getEditedFiles(wt);
}

/** The `revalidate` half — the same memo, hence the same authority. */
export async function editedFilesSignatureFor(conversationId: string): Promise<string> {
  const wt = await worktreeFor(conversationId);
  if (!wt) throw missingWorktree(conversationId);
  return editedFilesMemo.signature(wt);
}

export const editedFilesResource = defineExternalResource({
  key: "edited-files",
  mode: "invalidate",
  schema: EditedFilesPayloadSchema,
  loader: ({ id }: Params) => loadEditedFilesFor(id),
  // The ETag and the value are produced by ONE authority: `editedFilesMemo` is a
  // `createSignedMemo` binding `editedFilesSignature` (here) to `computeEditedFiles`
  // (the loader's `getEditedFiles`) at its single declaration site. `revalidate` and
  // `loader` are therefore provably the same function of the same inputs — they are
  // not two probes agreeing by convention, which is precisely how this resource
  // drifted into serving a stale value under a fresh ETag (permanent, because an
  // `invalidate`-mode push carries no value that could heal it).
  //
  // The signature is content-addressed and cheap: (headSha, mergeBase) + a per-dirty
  // -file (porcelain code, lstat mtime+size). It moves on an uncommitted save with no
  // SHA change, and it survives a server restart — preserving the 304 herd-collapse
  // this ETag exists for. Cost: 1 `rev-parse` + 1 `merge-base` + 1 `git status` + an
  // `lstat` per dirty file, vs. the loader's `merge-base` + two `git diff` passes +
  // full content reads of untracked files. See edited-files-signature.ts for the
  // faithfulness argument and research/2026-07-09-global-etag-value-coproduction.md.
  revalidate: ({ id }: Params): Promise<string> => editedFilesSignatureFor(id),
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
