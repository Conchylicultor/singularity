import {
  fileRefName,
  fileUrl,
} from "@plugins/primitives/plugins/file-viewer/core";
import type { FileRendererProps } from "@plugins/primitives/plugins/file-viewer/web";

/**
 * The file in the browser's built-in PDF viewer. host-fs serves a PDF without
 * the `sandbox` CSP it puts on every other raw file — a sandboxed document
 * cannot host the viewer.
 */
export function PdfView({ file }: FileRendererProps) {
  return (
    <iframe
      src={fileUrl(file)}
      title={fileRefName(file)}
      className="block size-full border-0"
    />
  );
}
