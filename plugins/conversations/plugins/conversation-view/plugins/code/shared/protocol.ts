export type EditedFileStatus = "modified" | "added" | "deleted" | "untracked";

export interface EditedFile {
  path: string;
  status: EditedFileStatus;
}

export interface EditedFilesResponse {
  files: EditedFile[];
}
