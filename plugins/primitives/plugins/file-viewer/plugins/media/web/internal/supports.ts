import {
  fileExtension,
  type FileRef,
} from "@plugins/primitives/plugins/file-viewer/core";

export type MediaKind = "video" | "audio";

// Containers a browser media element may play. Whether it actually can
// depends on the codec inside (an HEVC .mov, most .mkv/.avi in Chrome), which
// only the element can tell — a file it cannot decode falls back to "No
// preview". MIDI is not audio here: Sonata's file preview renders it.
const EXTS: Record<MediaKind, ReadonlySet<string>> = {
  video: new Set(["mp4", "m4v", "mov", "webm", "ogv", "mkv", "avi"]),
  audio: new Set(["mp3", "wav", "flac", "ogg", "oga", "opus", "m4a", "aac"]),
};

/**
 * Host files only: the checkout raw route serves image formats alone, so a
 * media file in a checkout would 415 — it stays with the last-resort fallback.
 */
export function supportsMedia(
  kind: MediaKind,
  file: FileRef,
): "native" | false {
  return file.source === "host" && EXTS[kind].has(fileExtension(file.path))
    ? "native"
    : false;
}
