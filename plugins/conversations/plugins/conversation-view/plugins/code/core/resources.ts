import { liveValue } from "@plugins/network/plugins/live/core";
import { EditedFilesPayloadSchema } from "./protocol";

// The edited files of a conversation's worktree, relative to its merge base.
// The payload is a `Resolvable<EditedFile[]>`: an unresolvable worktree is a
// settled `{ resolved: false, reason }`, never `[]` — an empty list would be an
// absorbable failure indistinguishable from a genuinely clean worktree. Not
// loaded yet is `pending` (a value has no placeholder).
export const editedFiles = liveValue("edited-files", {
  schema: EditedFilesPayloadSchema,
  params: ["id"],
});
