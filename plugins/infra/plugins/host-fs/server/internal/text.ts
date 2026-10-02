import { readFile, stat } from "node:fs/promises";
import { implement } from "@plugins/infra/plugins/endpoints/server";
import {
  HOST_FS_TEXT_MAX_BYTES,
  hostFsText,
  type HostFsTextResult,
} from "../../core";
import { classifyFsError, resolveHostPath } from "./path";

/** How many leading bytes the binary sniff inspects. */
const SNIFF_BYTES = 8000;

/** What a run of bytes is as text: decoded, too big to decode, or binary. */
export type TextBytesResult =
  | { kind: "ok"; content: string }
  | { kind: "too-large"; size: number }
  | { kind: "binary" };

/** A NUL byte in the first 8 KB — the same heuristic git and grep use. */
function looksBinary(bytes: Uint8Array): boolean {
  return bytes.subarray(0, Math.min(bytes.length, SNIFF_BYTES)).includes(0);
}

/**
 * Decode file bytes as UTF-8 text, refusing more than `HOST_FS_TEXT_MAX_BYTES`
 * and anything binary-sniffed. The one text gate every file reader shares —
 * host-fs `text` and code-explorer's git-ref reads alike — so they cannot
 * disagree about what "too large" or "binary" means.
 */
export function decodeTextBytes(bytes: Uint8Array): TextBytesResult {
  if (bytes.length > HOST_FS_TEXT_MAX_BYTES)
    return { kind: "too-large", size: bytes.length };
  if (looksBinary(bytes)) return { kind: "binary" };
  return { kind: "ok", content: new TextDecoder().decode(bytes) };
}

/** Read the absolute host file `path` as text. The size gate runs before the read. */
export async function readHostText(path: string): Promise<HostFsTextResult> {
  try {
    const st = await stat(path);
    if (!st.isFile()) return { kind: "not-a-file", path };
    if (st.size > HOST_FS_TEXT_MAX_BYTES)
      return { kind: "too-large", path, size: st.size };
    const bytes = await readFile(path);
    const decoded = decodeTextBytes(bytes);
    // The file may have grown between the stat and the read: the gate and the
    // reported size are both about the bytes actually read.
    return { ...decoded, path, size: bytes.length };
  } catch (err) {
    return { kind: classifyFsError(err), path };
  }
}

export const handleText = implement(hostFsText, ({ query }) =>
  readHostText(resolveHostPath(query.path)),
);
