import { resourceDescriptor } from "@plugins/primitives/plugins/live-state/core";
import { EditedFilesPayloadSchema, type EditedFile } from "./protocol";

export const editedFilesResource = resourceDescriptor<EditedFile[], { id: string }>(
  "edited-files",
  EditedFilesPayloadSchema,
  [],
);
