import { describe, expect, test } from "bun:test";
import {
  verbFailureMessage,
  verbSucceeded,
  type VerbEnding,
} from "./verb-outcome";

function ending(over: Partial<VerbEnding> = {}): VerbEnding {
  return { verb: "ship", exitCode: 1, signalCode: null, lines: [], ...over };
}

describe("verbSucceeded", () => {
  test("a clean exit is the only success", () => {
    expect(verbSucceeded(ending({ exitCode: 0 }))).toBe(true);
    expect(verbSucceeded(ending({ exitCode: 1 }))).toBe(false);
  });

  // The regression this file exists for: a killed child's status is `128 + signo`,
  // so a SIGTERM'd run arrives carrying a non-zero number that is not a status.
  // It must never be read as one.
  test("a signalled child never counts as having exited", () => {
    expect(verbSucceeded(ending({ exitCode: 143, signalCode: "TERM" }))).toBe(
      false,
    );
  });

  // The supervised-run shim records this exact pair for a SIGINT: POSIX makes a
  // non-interactive shell ignore INT for an asynchronous list's commands, so the
  // child genuinely ran to completion and exited 0 — while a signal was still
  // observed. Both facts are true; "succeeded" is not one of them, and reading
  // the number alone would say it was.
  test("a zero status with an observed signal is not a success", () => {
    expect(verbSucceeded(ending({ exitCode: 0, signalCode: "INT" }))).toBe(
      false,
    );
  });

  // No marker at all: a hard SIGKILL runs no shell, so the reconciler stamps a
  // status no child can produce rather than inventing a signal name.
  test("the hard-kill sentinel is not a success", () => {
    expect(verbSucceeded(ending({ exitCode: -1 }))).toBe(false);
  });
});

describe("verbFailureMessage", () => {
  test("prefers the CLI's named refusal over the transcript tail", () => {
    const message = verbFailureMessage(
      ending({
        lines: [
          "some remote script noise",
          "deploy: no bundle for linux-x64",
          "+ exit 1",
        ],
      }),
    );
    expect(message).toBe("no bundle for linux-x64");
  });

  // The scan is keyed on line CONTENT, which is why it survived stdout and
  // stderr merging into one transcript unchanged: a refusal is found by what it
  // says, never by which stream carried it.
  test("finds the refusal among interleaved stdout lines", () => {
    const message = verbFailureMessage(
      ending({
        lines: [
          "[1/4] resolving bundle",
          "deploy: this server has never been verified",
          "[2/4] uploading",
        ],
      }),
    );
    expect(message).toBe("this server has never been verified");
  });

  test("falls back to the last non-blank line", () => {
    expect(
      verbFailureMessage(ending({ lines: ["first", "last", "   "] })),
    ).toBe("last");
  });

  test("falls back to the status when the CLI said nothing", () => {
    expect(verbFailureMessage(ending({ exitCode: 2 }))).toBe(
      "Exited with code 2",
    );
  });

  test("a kill is reported as a kill, naming the signal — never as an exit code", () => {
    const message = verbFailureMessage(
      ending({ verb: "ship", exitCode: 143, signalCode: "TERM" }),
    );
    expect(message).toContain("TERM");
    expect(message).toContain("deploy ship");
    expect(message).not.toContain("Exited with code");
  });

  // The whole reason `signalCode` is observed rather than derived: these two
  // endings carry the identical status, and only the trap having fired tells
  // them apart. A consumer that re-derived killed-ness from `exitCode > 128`
  // would fail this test — which is the point of having it.
  test("a kill and a deliberate exit(143) are told apart", () => {
    const killed = verbFailureMessage(
      ending({ exitCode: 143, signalCode: "TERM" }),
    );
    const exited = verbFailureMessage(
      ending({ exitCode: 143, signalCode: null, lines: ["deploy: refused"] }),
    );
    expect(killed).toContain("killed by TERM");
    expect(exited).toBe("refused");
  });

  // A killed child's transcript tail is whatever it had got round to printing, so
  // quoting it would present an unrelated progress line as the cause — and a
  // `deploy: ` refusal left in the buffer belongs to nothing that ended this run.
  test("a kill ignores the transcript entirely", () => {
    const message = verbFailureMessage(
      ending({
        exitCode: 143,
        signalCode: "TERM",
        lines: ["deploy: something unrelated", "uploading bundle"],
      }),
    );
    expect(message).not.toContain("something unrelated");
    expect(message).not.toContain("uploading bundle");
  });

  // No marker, so no signal name anyone observed. The sentence must say what is
  // known — the process vanished — and must not claim a SIGTERM it did not see.
  test("a hard kill says the process vanished, and names no signal", () => {
    const message = verbFailureMessage(
      ending({ verb: "converge", exitCode: -1, signalCode: null }),
    );
    expect(message).toContain("deploy converge");
    expect(message).toContain("SIGKILL");
    expect(message).not.toContain("killed by");
    expect(message).not.toContain("Exited with code");
  });

  test("a hard kill ignores the transcript too", () => {
    const message = verbFailureMessage(
      ending({ exitCode: -1, signalCode: null, lines: ["deploy: unrelated"] }),
    );
    expect(message).not.toContain("unrelated");
  });
});
