import { describe, expect, test } from "bun:test";
import { formatSignalOrigin, signalName, type SignalOrigin } from "./types";

function origin(over: Partial<SignalOrigin> = {}): SignalOrigin {
  return {
    signal: 15,
    siCode: 1,
    senderPid: 41234,
    senderUid: 501,
    senderPath: "/bin/kill",
    ancestry: [
      { pid: 41234, ppid: 41198, uid: 501, comm: "kill" },
      { pid: 41198, ppid: 872, uid: 501, comm: "bun" },
      { pid: 872, ppid: 1, uid: 501, comm: "tmux" },
      { pid: 1, ppid: 1, uid: 0, comm: "launchd" },
    ],
    ancestryErrno: 0,
    selfPpid: 33000,
    wallNs: "1786053763482000000",
    monoNs: "123456789",
    hits: 1,
    ...over,
  };
}

describe("signalName", () => {
  test("names the signals whose numbers agree across darwin and linux", () => {
    expect(signalName(15)).toBe("SIGTERM");
    expect(signalName(2)).toBe("SIGINT");
    expect(signalName(1)).toBe("SIGHUP");
    expect(signalName(3)).toBe("SIGQUIT");
  });

  test("refuses to guess where the numbers diverge", () => {
    // SIGUSR1 is 30 on darwin and 10 on linux; SIGBUS is 10 vs 7. A pure
    // function has no platform to consult, so it says the number instead.
    expect(signalName(30)).toBe("signal 30");
    expect(signalName(10)).toBe("signal 10");
  });
});

describe("formatSignalOrigin", () => {
  test("names the sender and its ancestry", () => {
    expect(formatSignalOrigin(origin())).toBe(
      "SIGTERM from pid 41234 (/bin/kill) ← 41198 bun ← 872 tmux ← 1 launchd, uid 501",
    );
  });

  test("senderPid 0 reads as terminal/kernel-generated, not as 'pid 0'", () => {
    // An interactive Ctrl-C lands here, and it is NOT somebody running `kill`.
    expect(formatSignalOrigin(origin({ signal: 2, senderPid: 0, ancestry: [] }))).toBe(
      "SIGINT from the terminal (kernel-generated)",
    );
  });

  test("falls back to the sender's comm when the exe path was unreadable", () => {
    // Cross-uid `proc_pidpath` gets EPERM, but comm still resolves.
    expect(formatSignalOrigin(origin({ senderPath: null }))).toBe(
      "SIGTERM from pid 41234 (kill) ← 41198 bun ← 872 tmux ← 1 launchd, uid 501",
    );
  });

  test("a sender-only ancestry produces no chain", () => {
    expect(
      formatSignalOrigin(origin({ ancestry: [{ pid: 41234, ppid: 41198, uid: 501, comm: "kill" }] })),
    ).toBe("SIGTERM from pid 41234 (/bin/kill), uid 501");
  });

  test("a sender reaped before the handler ran says so, and still names the pid", () => {
    // The inherent limit of the mechanism: `/bin/kill` is often gone before the
    // victim is scheduled. The pid is still the actionable fact.
    expect(
      formatSignalOrigin(origin({ ancestry: [], senderPath: null, ancestryErrno: 3 })),
    ).toBe("SIGTERM from pid 41234 (already exited), uid 501");
  });

  test("an unexplained empty ancestry does not claim the sender exited", () => {
    expect(
      formatSignalOrigin(origin({ ancestry: [], senderPath: null, ancestryErrno: 1 })),
    ).toBe("SIGTERM from pid 41234 (unknown), uid 501");
  });

  test("an unmapped signal number formats as itself", () => {
    expect(formatSignalOrigin(origin({ signal: 30, ancestry: [] }))).toBe(
      "signal 30 from pid 41234 (/bin/kill), uid 501",
    );
  });
});
