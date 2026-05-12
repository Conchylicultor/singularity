import { z } from "zod";

export const EditedFileStatusSchema = z.enum([
  "modified",
  "added",
  "deleted",
  "untracked",
  "renamed",
  "copied",
  "clean",
]);
export type EditedFileStatus = z.infer<typeof EditedFileStatusSchema>;

export const EditedFileSchema = z.object({
  path: z.string(),
  status: EditedFileStatusSchema,
  additions: z.number().int(),
  deletions: z.number().int(),
  from: z.string().optional(),
});
export type EditedFile = z.infer<typeof EditedFileSchema>;

export const EditedFilesPayloadSchema = z.array(EditedFileSchema);

export interface EditedFilesResponse {
  files: EditedFile[];
}
