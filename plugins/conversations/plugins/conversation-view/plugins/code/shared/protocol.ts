export type EditedFileStatus =
  | "modified"
  | "added"
  | "deleted"
  | "untracked"
  | "renamed"
  | "copied"
  | "clean";

export interface EditedFile {
  path: string;
  status: EditedFileStatus;
  additions: number;
  deletions: number;
  from?: string;
}

export interface EditedFilesResponse {
  files: EditedFile[];
}
