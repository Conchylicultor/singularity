import { describe, expect, test } from "bun:test";
import { freeSlots, selectLaunches } from "./slots";

const c = (taskId: string) => ({ taskId, variables: { title: taskId } });

describe("freeSlots", () => {
  test("is the concurrency minus what runs", () => {
    expect(freeSlots(2, 0)).toBe(2);
    expect(freeSlots(2, 1)).toBe(1);
    expect(freeSlots(2, 2)).toBe(0);
  });

  test("never goes below zero when the concurrency was lowered under what runs", () => {
    expect(freeSlots(1, 3)).toBe(0);
  });
});

describe("selectLaunches", () => {
  test("takes the first `free` candidates, in rank order", () => {
    expect(
      selectLaunches([c("a"), c("b"), c("c")], new Set(), 2).map(
        (x) => x.taskId,
      ),
    ).toEqual(["a", "b"]);
  });

  test("skips taken tasks and fills the slot with the next one", () => {
    expect(
      selectLaunches([c("a"), c("b"), c("c")], new Set(["a"]), 2).map(
        (x) => x.taskId,
      ),
    ).toEqual(["b", "c"]);
  });

  test("launches a repeated id once", () => {
    expect(
      selectLaunches([c("a"), c("a"), c("b")], new Set(), 3).map(
        (x) => x.taskId,
      ),
    ).toEqual(["a", "b"]);
  });

  test("launches nothing without a free slot", () => {
    expect(selectLaunches([c("a")], new Set(), 0)).toEqual([]);
  });

  test("keeps each candidate's own variables", () => {
    expect(selectLaunches([c("a")], new Set(), 1)[0]?.variables).toEqual({
      title: "a",
    });
  });
});
