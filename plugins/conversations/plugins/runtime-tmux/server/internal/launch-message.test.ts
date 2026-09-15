import { describe, expect, test } from "bun:test";
import { asLaunchMessage } from "./launch-message";

describe("asLaunchMessage", () => {
  test("escapes a message that opens like a slash command", () => {
    // The task description that launched conv-1789483474-ratx as `/todo`.
    expect(asLaunchMessage("/todo blocks have an extra padding")).toBe(
      " /todo blocks have an extra padding",
    );
  });

  test("escapes any leading slash, file paths included", () => {
    expect(asLaunchMessage("/research/notes.md is wrong")).toBe(
      " /research/notes.md is wrong",
    );
  });

  test("leaves every other message untouched", () => {
    for (const prompt of [
      "Fix the /todo block padding",
      "!echo is not a shell escape here",
      "# a heading",
      " /already escaped",
      "",
    ]) {
      expect(asLaunchMessage(prompt)).toBe(prompt);
    }
  });
});
