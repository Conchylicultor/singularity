import { describe, expect, test } from "bun:test";
import { quoteMarkdown, quotedAnswer } from "./quote";

describe("quoteMarkdown", () => {
  test("prefixes every line, keeping blank lines inside the quote", () => {
    expect(quoteMarkdown("one\n\ntwo")).toBe("> one\n>\n> two");
  });
  test("trims the selection's surrounding whitespace", () => {
    expect(quoteMarkdown("\n  hello \n")).toBe("> hello");
  });
});

describe("quotedAnswer", () => {
  test("is the quote, a blank line, then the answer", () => {
    expect(quotedAnswer("a", "Go")).toBe("> a\n\nGo");
  });
});
