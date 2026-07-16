// Content-addressing: pure hash helpers. An artifact's hash is a function of
// the plugin's OWN files plus the global builder identity — never of other
// plugins' contents (late binding is the whole point: a change to plugin A can
// never invalidate plugin B's artifact).

import { createHash } from "node:crypto";

export function sha256Hex(input: string | Uint8Array): string {
  return createHash("sha256").update(input).digest("hex");
}

export interface OwnFile {
  /** Path relative to the plugin dir — part of the hash so renames invalidate. */
  rel: string;
  content: string | Uint8Array;
}

/**
 * Hash of a plugin's own source files. Files are sorted by `rel` and each entry
 * is length-prefixed, so no concatenation of (path, content) pairs can collide
 * with another split of the same bytes.
 */
export function computeOwnHash(files: OwnFile[]): string {
  const h = createHash("sha256");
  const sorted = [...files].sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0));
  for (const f of sorted) {
    h.update(`${f.rel}\n${typeof f.content === "string" ? Buffer.byteLength(f.content) : f.content.byteLength}\n`);
    h.update(f.content);
  }
  return h.digest("hex");
}

/**
 * The final store key of one artifact: own content ⊕ artifact kind ⊕ the global
 * builder identity (builder version, minify flag, toolchain versions, babel
 * contribution digest, inlined package versions — assembled in `identity.ts`).
 */
export function computeInputsHash(parts: {
  ownHash: string;
  kind: string;
  identityHash: string;
}): string {
  return sha256Hex(`${parts.kind}\n${parts.ownHash}\n${parts.identityHash}\n`);
}

/**
 * The global builder identity hash. Pure: callers assemble the version/digest
 * record (see `internal/identity.ts`); tests can drive it directly. Key order
 * is normalized so object-literal ordering can't change the hash.
 */
export function computeIdentityHash(identity: Record<string, string | number | boolean>): string {
  const keys = Object.keys(identity).sort();
  return sha256Hex(keys.map((k) => `${k}=${String(identity[k])}`).join("\n"));
}
