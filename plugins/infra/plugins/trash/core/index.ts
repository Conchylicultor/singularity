export { TrashEntrySchema, TrashOutcomeSchema } from "./schemas";
export type { TrashEntry, TrashOutcome } from "./schemas";

export { listTrash, restoreTrash, purgeTrash } from "./endpoints";

export { trashEntriesResource } from "./resources";
