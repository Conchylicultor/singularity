/**
 * Why a git command that talks to a remote FAILED.
 *
 * Deliberately not tied to `push`: the same three causes, read from the same
 * git output, decide what a failed `fetch` means too. What differs is only what
 * each caller does with the arms.
 *
 * - `denied` — the remote recognised us and refused THE OPERATION. For a write
 *   probe that is "you may not push here"; for a fetch it is "you may not read
 *   here". It is an answer about the repository, so it is the one a caller may
 *   reasonably record.
 * - `no-credentials` — the remote never learned who we are (a key it does not
 *   accept, a prompt we suppressed), so it said nothing about the repository.
 * - `unreachable` — nobody answered: DNS, the network, or our own deadline.
 * - `unclassified` — git failed for a fourth reason; the caller prints git's
 *   own words rather than pick the nearest label.
 */
export type RemoteFailure =
  | { kind: "denied"; detail: string }
  | { kind: "no-credentials"; detail: string }
  | { kind: "unreachable"; detail: string }
  | { kind: "unclassified"; detail: string };

/** What the classifier reads. A subset of `SpawnResult`, so it stays pure. */
export interface RemoteCapture {
  exitCode: number;
  timedOut: boolean;
  stdout: string;
  stderr: string;
}

// The three pattern sets, in the order they are tested. THE ORDER IS THE WHOLE
// DESIGN, because git prints the specific cause and the generic consequence
// together, and the generic line is identical for causes that mean opposite
// things:
//
//   ssh: Could not resolve hostname github.com: …      <- unreachable
//   fatal: Could not read from remote repository.
//
//   git@github.com: Permission denied (publickey).     <- no credentials
//   fatal: Could not read from remote repository.
//
// Matching the shared second line would classify a laptop with no network as a
// repository the user may not write to, and record it forever. So the specific
// causes are tested first and the generic line is matched by nothing.
//
// Within that, `no-credentials` is tested before `denied` for the same reason at
// a smaller scale: "Permission denied (publickey)" contains "permission denied",
// and it means the remote never found out who we are — not that it refused us.

const UNREACHABLE = [
  "could not resolve host",
  "could not resolve hostname",
  "temporary failure in name resolution",
  "name or service not known",
  "nodename nor servname provided",
  "connection timed out",
  "operation timed out",
  "connection refused",
  "network is unreachable",
  "no route to host",
  "failed to connect to",
  "couldn't connect to server",
  "ssh: connect to host",
];

const NO_CREDENTIALS = [
  "permission denied (publickey",
  "permission denied, please try again",
  "authentication failed",
  "invalid username or password",
  "could not read username",
  "could not read password",
  "terminal prompts disabled",
  "no supported authentication methods",
];

const DENIED = [
  // GitHub: "remote: Permission to Owner/repo.git denied to user."
  "denied to",
  "403",
  "access denied",
  "insufficient permission",
  "write access to repository not granted",
  "you are not allowed to push",
  "not authorized",
  "unauthorized",
  // A private repo you cannot see answers as if it did not exist. So does a
  // typo'd URL — both mean "you cannot use this remote", and both are fixed the
  // same way (repoint the remote).
  "repository not found",
  // Local filesystem transport, and the generic tail of several hosts. Last,
  // because "Permission denied (publickey)" above contains it.
  "permission denied",
];

/**
 * Read a failed remote git command's output.
 *
 * Pure — it is handed the capture, so every classification above can be checked
 * against real git output in a test without a network.
 *
 * THROWS on a capture that did not fail: a successful command has no failure to
 * classify, and returning `unclassified` for one would hand the caller a cause
 * for something that never went wrong. The one exception is a capture we killed
 * on our own deadline, which is a failure however the runtime reported its exit.
 */
export function classifyRemoteFailure(capture: RemoteCapture): RemoteFailure {
  // Our own deadline fired. The remote said nothing at all, which is the
  // definition of unreachable — a hung TCP connect looks exactly like this.
  // Checked first because a killed child's exit code is the runtime's business.
  const detail = firstLine(capture);
  if (capture.timedOut) {
    return { kind: "unreachable", detail: detail || "the command timed out" };
  }
  if (capture.exitCode === 0) {
    throw new Error(
      "classifyRemoteFailure was handed a command that succeeded; there is no failure to classify.",
    );
  }

  const haystack = `${capture.stderr}\n${capture.stdout}`.toLowerCase();
  if (UNREACHABLE.some((p) => haystack.includes(p))) {
    return { kind: "unreachable", detail };
  }
  if (NO_CREDENTIALS.some((p) => haystack.includes(p))) {
    return { kind: "no-credentials", detail };
  }
  if (DENIED.some((p) => haystack.includes(p))) {
    return { kind: "denied", detail };
  }
  return { kind: "unclassified", detail };
}

// git puts the specific cause on the first line and the generic consequence
// after it, so the first non-empty line is the informative one. Capped because
// it lands in a single printed sentence.
const DETAIL_MAX = 200;

function firstLine(capture: RemoteCapture): string {
  const text = capture.stderr.trim() || capture.stdout.trim();
  const line =
    text
      .split("\n")
      .find((l) => l.trim().length > 0)
      ?.trim() ?? "";
  return line.length > DETAIL_MAX ? `${line.slice(0, DETAIL_MAX)}…` : line;
}
