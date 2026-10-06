import type { RendererMatch } from "@plugins/primitives/plugins/file-viewer/web";
import {
  fileExtension,
  type FileRef,
} from "@plugins/primitives/plugins/file-viewer/core";

const MIDI_EXTENSIONS = new Set(["mid", "midi"]);

/**
 * The MIDI renderer is the native view of a `.mid` / `.midi` HOST file. A
 * checkout file is not offered: code-api's raw route serves image formats only.
 */
export function supportsMidi(file: FileRef): RendererMatch {
  return file.source === "host" && MIDI_EXTENSIONS.has(fileExtension(file.path))
    ? "native"
    : false;
}
