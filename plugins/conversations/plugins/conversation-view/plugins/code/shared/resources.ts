import { resourceDescriptor } from "@plugins/primitives/plugins/live-state/shared";
import { EditedFilesPayloadSchema, type EditedFile } from "./protocol";

export const editedFilesResource = resourceDescriptor<EditedFile[], { id: string }>(
  "edited-files",
  EditedFilesPayloadSchema,
);
