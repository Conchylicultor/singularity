import type { SshFailureKind } from "../../core";

/** Where and as whom to connect, and with what key. */
export interface SshTarget {
  host: string;
  port: number;
  user: string;
  /** OpenSSH-format private key. Written 0600 into a mkdtemp dir, removed in `finally`. */
  privateKey: string;
  /**
   * Host-key policy. There is deliberately no "off": an unverified host is never
   * a successful connection. `learn` is trust-on-first-use and returns the line
   * it learned so the caller can pin it; `pinned` requires an exact match.
   */
  hostKey: { mode: "pinned"; knownHostsLine: string } | { mode: "learn" };
  /** Hard wall-clock ceiling for the whole attempt. Default 15_000. */
  timeoutMs?: number;
}

/**
 * The outcome of one `sshRun`. A discriminated result, not a throw: every
 * listed failure is an expected, actionable state of a remote host the user is
 * still setting up — the caller renders it, it is not an exception. Failure can
 * never be mistaken for an empty success, because the two shapes differ.
 *
 * `learnedHostKey` is non-null only under `hostKey.mode === "learn"` on a
 * successful connection — it is the `known_hosts` line to persist and pin.
 */
export type SshRunResult =
  | { ok: true; stdout: string; stderr: string; learnedHostKey: string | null }
  | {
      ok: false;
      kind: SshFailureKind;
      /** One-line, human-readable summary safe to show in the UI. */
      message: string;
      /** OpenSSH's own diagnostic text, verbatim. Never contains key material. */
      stderr: string;
      /** `null` when the child was killed by a signal (incl. our own deadline). */
      exitCode: number | null;
    };
