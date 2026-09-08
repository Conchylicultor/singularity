import { describe, expect, test } from "bun:test";
import { readTaskReport } from "./task-reports";
import type { TranscriptRead } from "./types";

/** One transcript record, shaped as the harness writes it (newlines escaped). */
function notification(id: string, status = "completed"): TranscriptRead {
  return {
    kind: "read",
    text: JSON.stringify({
      type: "user",
      message: {
        role: "user",
        content:
          `<task-notification>\n<task-id>${id}</task-id>\n` +
          `<tool-use-id>toolu_01</tool-use-id>\n` +
          `<output-file>/tmp/tasks/${id}.output</output-file>\n` +
          `<status>${status}</status>\n</task-notification>`,
      },
    }),
  };
}

describe("readTaskReport", () => {
  test("finds the status the harness reported", () => {
    expect(readTaskReport(notification("bf3x85ny5"), "bf3x85ny5")).toEqual({
      kind: "reported",
      status: "completed",
    });
  });

  test("carries a non-completed status through rather than assuming success", () => {
    const r = readTaskReport(notification("bq1", "failed"), "bq1");
    expect(r.kind === "reported" && r.status).toBe("failed");
  });

  test("a task the transcript never mentions has not reported", () => {
    expect(readTaskReport(notification("bf3x85ny5"), "bother1d").kind).toBe(
      "no-report",
    );
  });

  test("merely NAMING the output file is not a report", () => {
    // The command an agent types mentions the same id and the same path. Only
    // the harness's own `<task-id>` tag counts, or every look would look like a
    // completion notice.
    const transcript: TranscriptRead = {
      kind: "read",
      text: 'tail -30 /tmp/tasks/bf3x85ny5.output; echo "bf3x85ny5"',
    };
    expect(readTaskReport(transcript, "bf3x85ny5").kind).toBe("no-report");
  });

  test("a notification for a DIFFERENT task does not answer for this one", () => {
    // Two adjacent notifications: the status must not be read across the
    // boundary from the neighbouring record.
    const transcript: TranscriptRead = {
      kind: "read",
      text:
        `<task-notification>\n<task-id>bbbb</task-id>\n</task-notification>` +
        `<task-notification>\n<task-id>cccc</task-id>\n<status>completed</status>\n</task-notification>`,
    };
    expect(readTaskReport(transcript, "bbbb").kind).toBe("no-report");
    expect(readTaskReport(transcript, "cccc").kind).toBe("reported");
  });

  test("no transcript is unreadable, never silently 'no report'", () => {
    const r = readTaskReport(
      { kind: "unavailable", why: "no transcript path in the payload" },
      "bf3x85ny5",
    );
    expect(r.kind).toBe("unreadable");
  });

  test("an id that is not an id cannot reach the regex", () => {
    expect(readTaskReport(notification("bq1"), "b.*|(").kind).toBe(
      "unreadable",
    );
  });
});
