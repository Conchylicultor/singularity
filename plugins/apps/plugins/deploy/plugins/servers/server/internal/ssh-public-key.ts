import { createHash } from "node:crypto";
import { InvalidSshKeyError } from "./ssh-key-error";
import type { SshKey } from "../../shared";

/**
 * Parses an `authorized_keys` line into its identity, including the SHA256
 * fingerprint `ssh-keygen -lf` would print for the same line — byte for byte.
 *
 * Server-side on purpose: `createHash` is not web-safe, and `crypto.subtle` is
 * async and awkward to call during render.
 */
export function parseSshPublicKey(line: string): SshKey {
  const trimmed = line.trim();
  // Comments may contain spaces, so everything after the blob is the comment.
  const [algorithm, blob, ...rest] = trimmed.split(/\s+/);
  if (algorithm === undefined || blob === undefined) {
    throw new InvalidSshKeyError(
      "unsupported-format",
      "not an OpenSSH public key line (expected `<algorithm> <base64> [comment]`)",
    );
  }
  const bytes = Buffer.from(blob, "base64");

  // The blob is a sequence of length-prefixed fields whose first is the
  // algorithm name. Validating that structurally — rather than against a list
  // of known key types — rejects garbage and truncated base64 (which
  // `Buffer.from` decodes silently) while letting ssh-rsa / ecdsa-* / sk-*
  // keys work with no code change here.
  if (bytes.length < 4) {
    throw new InvalidSshKeyError("unsupported-format", "key blob is truncated");
  }
  const nameLength = bytes.readUInt32BE(0);
  if (
    4 + nameLength > bytes.length ||
    bytes.subarray(4, 4 + nameLength).toString("utf8") !== algorithm
  ) {
    throw new InvalidSshKeyError(
      "unsupported-format",
      `key blob does not encode algorithm \`${algorithm}\``,
    );
  }

  return {
    algorithm,
    // SHA-256 over the DECODED blob, base64 with padding stripped — that exact
    // recipe is what makes this equal to `ssh-keygen -lf`'s output.
    fingerprint: `SHA256:${createHash("sha256").update(bytes).digest("base64").replace(/=+$/, "")}`,
    comment: rest.join(" "),
    publicKey: trimmed,
  };
}
