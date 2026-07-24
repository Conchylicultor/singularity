/**
 * The classified reason an SSH attempt failed.
 *
 * This lives in `core/` (web-safe — no node-only imports) because the UI keys
 * its remediation copy off the kind: "the key isn't installed for this user
 * yet" and "the host's identity changed" need completely different words and
 * completely different next actions, and only the server can tell them apart.
 *
 * `unknown` is a first-class variant on purpose. Classification comes from
 * matching OpenSSH's own English stderr, which no contract guarantees; when a
 * message doesn't match anything we know, the raw stderr is carried to the UI
 * verbatim rather than guessed at or collapsed into a neighbouring kind. An
 * unrecognized failure must stay visibly unrecognized.
 */
import { z } from "zod";

export const SshFailureKindSchema = z.enum([
  /** The hostname does not resolve. */
  "dns",
  /** Refused / no route / network unreachable — nothing listening or no path. */
  "unreachable",
  /** The connect or the whole attempt exceeded its deadline. */
  "timeout",
  /** Publickey rejected — the key is not installed for this user. */
  "auth",
  /** The pinned host key no longer matches what the host presented. */
  "host-key-mismatch",
  /** Connected AND authenticated; the remote command itself exited non-zero. */
  "command-failed",
  /** Unclassified — carries raw stderr, never silently absorbed. */
  "unknown",
]);

export type SshFailureKind = z.infer<typeof SshFailureKindSchema>;
