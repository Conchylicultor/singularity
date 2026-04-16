export type EditedFileStatus = "modified" | "added" | "deleted" | "untracked";

export interface EditedFile {
  path: string;
  status: EditedFileStatus;
  additions: number;
  deletions: number;
}

export interface EditedFilesResponse {
  files: EditedFile[];
}
