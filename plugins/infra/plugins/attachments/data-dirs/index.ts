import { defineDataDir } from "@plugins/infra/plugins/paths/core";

/**
 * The attachment bytes themselves: one UUID-named file per row of
 * `attachments`, extension taken from the original filename.
 *
 * Host-global rather than per-worktree because an attachment outlives the
 * worktree that uploaded it — a screenshot filed against a task is read from
 * main long after the agent's checkout is gone.
 */
export const attachmentsDir = defineDataDir({
  kind: "apps",
  name: "attachments",
  owner: "infra/attachments",
  description:
    "Uploaded attachment bytes, one UUID-named file per attachments row (screenshots, pasted images, uploaded files)",
  // The DB row holds only metadata — filename, mime, size, owner link. The
  // bytes exist nowhere else, so deleting this tree turns every attachment in
  // the app into a broken link with no way back.
  reclaim: {
    kind: "never",
    reason:
      "the DB holds only each attachment's metadata; these files are the only copy of the bytes",
  },
});

export default [attachmentsDir];
