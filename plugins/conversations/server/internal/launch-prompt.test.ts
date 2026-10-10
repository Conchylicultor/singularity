import { describe, expect, test } from "bun:test";
import { resolveLaunchPrompt } from "./launch-prompt";

const task = {
  title: "Fix the thing",
  description: "It breaks.",
  titleAuto: false,
};

describe("resolveLaunchPrompt", () => {
  test("the caller's prompt wins over the marker's and the task's", async () => {
    const prompt = await resolveLaunchPrompt({
      explicit: "from the caller",
      armed: "from the marker",
      readTask: () => {
        throw new Error("the task is not read");
      },
    });
    expect(prompt).toBe("from the caller");
  });

  test("the marker's prompt wins over the task's own text", async () => {
    const prompt = await resolveLaunchPrompt({
      explicit: undefined,
      armed: "from the marker",
      readTask: () => {
        throw new Error("the task is not read");
      },
    });
    expect(prompt).toBe("from the marker");
  });

  test("with neither, the task's own text", async () => {
    const prompt = await resolveLaunchPrompt({
      explicit: undefined,
      armed: null,
      readTask: async () => task,
    });
    expect(prompt).toBe("Fix the thing\n\nIt breaks.");
  });

  test("an empty marker prompt is still the marker's", async () => {
    const prompt = await resolveLaunchPrompt({
      explicit: undefined,
      armed: "",
      readTask: async () => task,
    });
    expect(prompt).toBe("");
  });
});
