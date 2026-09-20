import { describe, expect, test } from "bun:test";
import { typedChunks } from "./typed-keys";

describe("typedChunks", () => {
  test("a short turn is one write", () => {
    expect(
      typedChunks("Answering your questions:\n\n- Scope: delete it"),
    ).toEqual(["Answering your questions:\n\n- Scope: delete it"]);
  });

  test("newlines ride along — they do not split a chunk", () => {
    const text = Array.from({ length: 29 }, (_, i) => `row ${i}`).join("\n");
    expect(typedChunks(text)).toEqual([text]);
  });

  test("every chunk stays under the CLI's paste threshold", () => {
    for (const chunk of typedChunks("x".repeat(5_000))) {
      expect(chunk.length).toBeLessThanOrEqual(600);
    }
  });

  test("concatenating the chunks reproduces the turn", () => {
    const text = `${"la ".repeat(4_000)}end`;
    expect(typedChunks(text).join("")).toBe(text);
  });

  test("tabs become the four spaces the CLI's paste path substituted", () => {
    // A typed tab is a key, not a character: the CLI eats it.
    expect(typedChunks("before\tafter")).toEqual(["before    after"]);
  });

  test("a surrogate pair is never severed across two writes", () => {
    // 599 single-unit chars then an emoji: the pair does not fit in the
    // remaining unit, so it starts the next chunk rather than being split.
    const text = `${"a".repeat(599)}🙂tail`;
    const chunks = typedChunks(text);
    expect(chunks.join("")).toBe(text);
    for (const chunk of chunks) {
      expect(chunk).not.toMatch(/[\uD800-\uDBFF]$/);
      expect(chunk).not.toMatch(/^[\uDC00-\uDFFF]/);
    }
  });

  test("an empty turn is no writes at all", () => {
    expect(typedChunks("")).toEqual([]);
  });
});
