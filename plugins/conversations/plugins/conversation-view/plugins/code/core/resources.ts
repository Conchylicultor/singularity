import { resourceDescriptor, unresolved } from "@plugins/primitives/plugins/live-state/core";
import { EditedFilesPayloadSchema, type EditedFilesPayload } from "./protocol";

// `initialData` is the self-describing non-value `unresolved("not loaded")` — not
// `[]`, which would be an absorbable failure indistinguishable from a genuinely
// clean worktree. After the readiness gate this is never observed through
// `useResource` anyway (a value you can read is one the server vouches for), but
// the honest non-value is the right default.
export const editedFilesResource = resourceDescriptor<EditedFilesPayload, { id: string }>(
  "edited-files",
  EditedFilesPayloadSchema,
  unresolved("not loaded"),
);
