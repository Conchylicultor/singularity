import type { FieldOption } from "@plugins/primitives/plugins/data-view/core";
import {
  fileTypeOf,
  type FilePreview,
} from "@plugins/primitives/plugins/file-type/core";
import type { EntryRow } from "./entry-row";

type KindSource = Pick<EntryRow, "name" | "kind">;

/**
 * What an entry is, in words (Finder's Kind): "Folder" for a directory, "Link"
 * for a symlink that cannot be followed, "Other" for a socket / device / fifo,
 * and otherwise the file type its name says ("PDF document", "PNG file",
 * "File"). An archive's row stays a file ("ZIP archive").
 */
export function entryKindLabel(row: KindSource): string {
  switch (row.kind) {
    case "dir":
      return "Folder";
    case "symlink":
      return "Link";
    case "other":
      return "Other";
    case "file":
      return fileTypeOf(row.name).label;
  }
}

/** A coarse grouping of what entries are, for grouping and filtering. */
export type EntryCategory =
  | "folder"
  | "image"
  | "video"
  | "audio"
  | "pdf"
  | "document"
  | "code"
  | "other";

const CATEGORY_OF_PREVIEW: Record<FilePreview, EntryCategory> = {
  image: "image",
  video: "video",
  audio: "audio",
  pdf: "pdf",
  markdown: "document",
  text: "document",
  csv: "document",
  code: "code",
};

/** The entry's category: a folder, or its file type's preview folded coarser. */
export function entryCategory(row: KindSource): EntryCategory {
  if (row.kind === "dir") return "folder";
  if (row.kind !== "file") return "other";
  const preview = fileTypeOf(row.name).preview;
  return preview === undefined ? "other" : CATEGORY_OF_PREVIEW[preview];
}

/** The category field's options, in the order a group-by lists them. */
export const ENTRY_CATEGORY_OPTIONS: FieldOption[] = [
  { value: "folder", label: "Folders" },
  { value: "image", label: "Images" },
  { value: "video", label: "Videos" },
  { value: "audio", label: "Audio" },
  { value: "pdf", label: "PDFs" },
  { value: "document", label: "Documents" },
  { value: "code", label: "Code" },
  { value: "other", label: "Other" },
] satisfies (FieldOption & { value: EntryCategory })[];

/**
 * The name's last extension, lowercase and without the dot — `a.tar.gz` →
 * `gz` — or `null` for a name without one, a dotfile with no further dot
 * (`.gitignore`) included.
 */
export function entryExtension(name: string): string | null {
  const dot = name.lastIndexOf(".");
  if (dot <= 0 || dot === name.length - 1) return null;
  return name.slice(dot + 1).toLowerCase();
}
