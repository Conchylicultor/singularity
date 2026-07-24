/**
 * Pins every `SshFailureKind` against VERBATIM OpenSSH stderr.
 *
 * The classifier reads an unstable contract (English diagnostics), so the
 * samples below are copied as OpenSSH actually emits them — including the
 * banner art, the trailing periods and the platform-specific resolver wording
 * (macOS says "nodename nor servname", glibc says "Name or service not known").
 * Editing a sample to make a test pass defeats the entire point of the file.
 *
 * `classify` is pure, so every branch is covered here with no process spawned.
 */
import { describe, expect, test } from "bun:test";
import { classify, failureMessage } from "./classify";

/** ssh's own failures — DNS, connect, auth, host key — are all exit 255. */
const SSH_FAIL = 255;

describe("dns", () => {
  test("macOS/BSD resolver wording", () => {
    const stderr = "ssh: Could not resolve hostname nope.invalid: nodename nor servname provided, or not known\n";
    expect(classify(SSH_FAIL, null, stderr, false)).toBe("dns");
  });

  test("glibc resolver wording", () => {
    const stderr = "ssh: Could not resolve hostname deploy.example: Name or service not known\n";
    expect(classify(SSH_FAIL, null, stderr, false)).toBe("dns");
  });
});

describe("unreachable", () => {
  test("connection refused (nothing listening on the port)", () => {
    const stderr = "ssh: connect to host 1.2.3.4 port 22: Connection refused\n";
    expect(classify(SSH_FAIL, null, stderr, false)).toBe("unreachable");
  });

  test("no route to host", () => {
    const stderr = "ssh: connect to host 10.9.8.7 port 22: No route to host\n";
    expect(classify(SSH_FAIL, null, stderr, false)).toBe("unreachable");
  });

  test("network is unreachable", () => {
    const stderr = "ssh: connect to host 2a01:4f8::1 port 22: Network is unreachable\n";
    expect(classify(SSH_FAIL, null, stderr, false)).toBe("unreachable");
  });

  test("host is down", () => {
    const stderr = "ssh: connect to host 192.0.2.10 port 22: Host is down\n";
    expect(classify(SSH_FAIL, null, stderr, false)).toBe("unreachable");
  });
});

describe("timeout", () => {
  test("linux connect timeout", () => {
    const stderr = "ssh: connect to host 192.0.2.1 port 22: Connection timed out\n";
    expect(classify(SSH_FAIL, null, stderr, false)).toBe("timeout");
  });

  test("macOS connect timeout", () => {
    const stderr = "ssh: connect to host 192.0.2.1 port 22: Operation timed out\n";
    expect(classify(SSH_FAIL, null, stderr, false)).toBe("timeout");
  });

  test("our own deadline wins over whatever ssh was saying", () => {
    // A child we SIGTERM'd has no exit status and may have printed nothing.
    expect(classify(null, "SIGTERM", "", true)).toBe("timeout");
  });

  test("our own deadline outranks an otherwise-classifiable stderr", () => {
    // ssh got as far as offering a key before we killed it — the reason the
    // caller has no answer is still that time ran out, not the key.
    const stderr = "debian@1.2.3.4: Permission denied (publickey).\n";
    expect(classify(null, "SIGKILL", stderr, true)).toBe("timeout");
  });
});

describe("auth", () => {
  test("publickey rejected", () => {
    const stderr = "root@1.2.3.4: Permission denied (publickey).\n";
    expect(classify(SSH_FAIL, null, stderr, false)).toBe("auth");
  });

  test("publickey among several offered methods", () => {
    const stderr = "deploy@example.com: Permission denied (publickey,password,keyboard-interactive).\n";
    expect(classify(SSH_FAIL, null, stderr, false)).toBe("auth");
  });

  test("too many authentication failures", () => {
    const stderr = "Received disconnect from 1.2.3.4 port 22:2: Too many authentication failures\n";
    expect(classify(SSH_FAIL, null, stderr, false)).toBe("auth");
  });
});

describe("host-key-mismatch", () => {
  test("the full REMOTE HOST IDENTIFICATION HAS CHANGED banner", () => {
    const stderr = `@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@
@    WARNING: REMOTE HOST IDENTIFICATION HAS CHANGED!     @
@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@
IT IS POSSIBLE THAT SOMEONE IS DOING SOMETHING NASTY!
Someone could be eavesdropping on you right now (man-in-the-middle attack)!
It is also possible that a host key has just been changed.
The fingerprint for the ED25519 key sent by the remote host is
SHA256:8f3Xw9C0m9m0m6bWJZ0kM3wq3kq0Bq3nGm0Fh8VYb1o.
Please contact your system administrator.
Add correct host key in /tmp/sg-ssh-abc/known_hosts to get rid of this message.
Offending ED25519 key in /tmp/sg-ssh-abc/known_hosts:1
Host key for 1.2.3.4 has changed and you have requested strict checking.
Host key verification failed.
`;
    expect(classify(SSH_FAIL, null, stderr, false)).toBe("host-key-mismatch");
  });

  test("bare host key verification failure", () => {
    const stderr = "Host key verification failed.\n";
    expect(classify(SSH_FAIL, null, stderr, false)).toBe("host-key-mismatch");
  });

  test("outranks auth when the banner also mentions permission denied", () => {
    // Mislabelling a changed host key as "your key isn't installed" would send
    // the user to re-paste a key at a host that may not be theirs.
    const stderr = `@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@
@    WARNING: REMOTE HOST IDENTIFICATION HAS CHANGED!     @
@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@
root@1.2.3.4: Permission denied (publickey).
`;
    expect(classify(SSH_FAIL, null, stderr, false)).toBe("host-key-mismatch");
  });
});

describe("command-failed", () => {
  test("a non-255 exit is the remote command's own status", () => {
    expect(classify(1, null, "", false)).toBe("command-failed");
  });

  test("remote stderr is NOT matched against ssh's vocabulary", () => {
    // The remote command connected fine and printed its own diagnostic that
    // happens to collide with OpenSSH's wording. Reading it as an ssh-layer
    // failure would blame the wrong hop entirely.
    const stderr = "curl: (7) Failed to connect to localhost port 8080: Connection refused\n";
    expect(classify(7, null, stderr, false)).toBe("command-failed");
  });
});

describe("unknown", () => {
  test("an unrecognized 255 stays unknown and keeps its stderr", () => {
    const stderr = "ssh: Something entirely new went wrong in a future OpenSSH\n";
    const kind = classify(SSH_FAIL, null, stderr, false);
    expect(kind).toBe("unknown");
    // The raw diagnostic is what reaches the user — nothing is invented.
    expect(failureMessage(kind, stderr)).toBe(
      "ssh: Something entirely new went wrong in a future OpenSSH",
    );
  });

  test("empty stderr on 255 stays unknown with a stated fallback", () => {
    const kind = classify(SSH_FAIL, null, "", false);
    expect(kind).toBe("unknown");
    expect(failureMessage(kind, "")).toBe("SSH failed for an unrecognized reason.");
  });

  test("killed by a signal that was NOT our deadline", () => {
    // Someone else killed the child. We do not know why — say so.
    expect(classify(null, "SIGKILL", "", false)).toBe("unknown");
  });
});

describe("failureMessage", () => {
  test("every kind has a non-empty summary", () => {
    const kinds = [
      "dns",
      "unreachable",
      "timeout",
      "auth",
      "host-key-mismatch",
      "command-failed",
      "unknown",
    ] as const;
    for (const kind of kinds) {
      expect(failureMessage(kind, "some stderr").length).toBeGreaterThan(0);
    }
  });
});
