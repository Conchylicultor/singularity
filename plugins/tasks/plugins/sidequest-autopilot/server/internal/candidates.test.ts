import { describe, expect, test } from "bun:test";
import { NO_DESCRIPTION, sidequestCandidates } from "./candidates";

const task = (
  id: string,
  description: string | null,
  title = `Task ${id}`,
) => ({
  id,
  title,
  description,
  createdAt: new Date("2026-10-01T00:00:00Z"),
});

describe("sidequestCandidates", () => {
  test("keeps the order it is given (oldest first)", () => {
    expect(
      sidequestCandidates([task("a", "x"), task("b", "y")]).map(
        (c) => c.taskId,
      ),
    ).toEqual(["a", "b"]);
  });

  test("fills the template's variables from the task", () => {
    expect(
      sidequestCandidates([task("a", "  It breaks.  ")])[0]?.variables,
    ).toEqual({ taskId: "a", title: "Task a", description: "It breaks." });
  });

  test("a task without a description says so rather than leaving a hole", () => {
    expect(
      sidequestCandidates([task("a", null)])[0]?.variables.description,
    ).toBe(NO_DESCRIPTION);
    expect(
      sidequestCandidates([task("a", "   ")])[0]?.variables.description,
    ).toBe(NO_DESCRIPTION);
  });

  test("an empty title reads as Untitled", () => {
    expect(sidequestCandidates([task("a", "x", " ")])[0]?.variables.title).toBe(
      "Untitled",
    );
  });
});
