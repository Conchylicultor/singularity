/**
 * Turn an `ssh` process outcome into a {@link SshFailureKind}.
 *
 * We shell out to the system `ssh` (see the plugin's CLAUDE.md for why), so the
 * only signal about *what* went wrong is OpenSSH's own English stderr. That is
 * an unstable contract, and this module treats it as one: matching is
 * conservative and case-insensitive, and anything unmatched becomes `unknown`
 * with the raw stderr carried through — never bucketed into a nearby kind.
 *
 * Deliberately a PURE function of `(exitCode, signalCode, stderr, timedOut)`,
 * with no I/O and no spawn: the classification table is the expensive-to-get-
 * wrong part of this plugin and the cheap-to-test part, and keeping it pure is
 * what makes `classify.test.ts` able to pin every branch against verbatim
 * OpenSSH samples.
 */
import type { SshFailureKind } from "../../core";

/**
 * `ssh` reports ALL of its own failures — DNS, connect, auth, host key — as
 * exit status 255. Any other non-zero status is the remote command's own exit
 * status passed through verbatim.
 */
const SSH_OWN_FAILURE_EXIT = 255;

/**
 * Ordered stderr patterns. Order is load-bearing where messages overlap:
 * the host-key banner is checked first because it is the most specific and the
 * most security-relevant thing to never mislabel, and `timeout`'s substrings
 * would otherwise catch text that a more specific kind should own.
 */
const STDERR_PATTERNS: ReadonlyArray<{ kind: SshFailureKind; patterns: readonly string[] }> = [
  {
    kind: "host-key-mismatch",
    patterns: ["host key verification failed", "remote host identification has changed"],
  },
  {
    kind: "dns",
    patterns: [
      "could not resolve hostname",
      "name or service not known",
      "nodename nor servname",
    ],
  },
  {
    kind: "unreachable",
    patterns: [
      "connection refused",
      "no route to host",
      "network is unreachable",
      "host is down",
    ],
  },
  {
    kind: "timeout",
    patterns: ["connection timed out", "operation timed out", "timed out"],
  },
  {
    kind: "auth",
    patterns: ["permission denied (publickey", "too many authentication failures"],
  },
];

/**
 * Classify a FAILED `ssh` invocation. Only ever called once the caller has
 * established the attempt did not succeed — a clean `exit 0` has no kind.
 *
 * @param exitCode process exit status, or `null` when it died on a signal.
 * @param signalCode the signal that killed it, or `null`.
 * @param stderr OpenSSH's diagnostic output, verbatim.
 * @param timedOut whether OUR OWN deadline fired and killed the child.
 */
export function classify(
  exitCode: number | null,
  signalCode: string | null,
  stderr: string,
  timedOut: boolean,
): SshFailureKind {
  // Our deadline wins over everything: whatever ssh was about to say, the
  // reason the caller has no answer is that time ran out.
  if (timedOut) return "timeout";

  // An exit status ssh never uses for its own failures means we connected AND
  // authenticated and the REMOTE COMMAND exited non-zero. Decided before any
  // stderr matching, so a remote command that happens to print "Connection
  // refused" (curl, a health probe) is not misread as an ssh-layer failure.
  if (signalCode === null && exitCode !== null && exitCode !== SSH_OWN_FAILURE_EXIT) {
    return "command-failed";
  }

  const haystack = stderr.toLowerCase();
  for (const { kind, patterns } of STDERR_PATTERNS) {
    if (patterns.some((p) => haystack.includes(p))) return kind;
  }

  // Exit 255 (or a signal) with nothing we recognize. Not a guess, not a
  // silent absorb — the caller carries the raw stderr to the UI.
  return "unknown";
}

/**
 * A one-line, human-readable summary for a classified failure. The UI keys its
 * real remediation copy off the `kind`; this is the fallback sentence that
 * still reads correctly in a log line, a toast, or a stored `failure_message`.
 */
export function failureMessage(kind: SshFailureKind, stderr: string): string {
  switch (kind) {
    case "dns":
      return "The hostname could not be resolved.";
    case "unreachable":
      return "The host refused the connection or is not reachable on this port.";
    case "timeout":
      return "The connection timed out.";
    case "auth":
      return "The server rejected the key — it is not installed for this user yet.";
    case "host-key-mismatch":
      return "The host's SSH identity does not match the pinned host key.";
    case "command-failed":
      return "Connected and authenticated, but the remote command failed.";
    case "unknown":
      // No summary to invent — the diagnostic IS the message.
      return firstMeaningfulLine(stderr) || "SSH failed for an unrecognized reason.";
  }
}

/** First non-empty stderr line, trimmed — OpenSSH puts the diagnosis first. */
function firstMeaningfulLine(stderr: string): string {
  for (const line of stderr.split("\n")) {
    const trimmed = line.trim();
    if (trimmed !== "") return trimmed;
  }
  return "";
}
