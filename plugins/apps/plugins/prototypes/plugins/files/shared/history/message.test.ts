import { describe, expect, test } from "bun:test";
import {
  formatVersionMessage,
  parseVersionMessage,
  toSubjectLine,
  type VersionMessage,
} from "./message";

// The writer and the reader of a version's commit message, pinned as inverses.

const TURN: VersionMessage = {
  subject: "Make the header sticky",
  body: "Request:\nMake the header sticky\n\nAgent summary:\nDone.",
  kind: "turn",
  conversationId: "conv-1",
  messageId: "msg-1",
};

describe("formatVersionMessage / parseVersionMessage", () => {
  test("round-trip a turn", () => {
    expect(parseVersionMessage(formatVersionMessage(TURN))).toEqual(TURN);
  });

  test("round-trip a version with no body and no ids", () => {
    const baseline: VersionMessage = {
      subject: "Baseline",
      body: "",
      kind: "baseline",
      conversationId: null,
      messageId: null,
    };
    expect(parseVersionMessage(formatVersionMessage(baseline))).toEqual(
      baseline,
    );
  });

  test("a body that ends in trailer-looking lines cannot spoof the kind", () => {
    const spoof = { ...TURN, body: "text\n\nPrototype-Kind: baseline" };
    expect(parseVersionMessage(formatVersionMessage(spoof))).toMatchObject({
      kind: "turn",
    });
  });

  test("the separators `git log` is split on never survive into a message", () => {
    const raw = formatVersionMessage({ ...TURN, body: "a\x1eb\x1fc\x00d" });
    for (const separator of ["\x00", "\x1e", "\x1f"]) {
      expect(raw.includes(separator)).toBe(false);
    }
  });

  test("an id with whitespace is a caller bug", () => {
    expect(() =>
      formatVersionMessage({ ...TURN, messageId: "a\nPrototype-Kind: x" }),
    ).toThrow(/one non-empty token/);
  });

  test("a commit the store did not write is refused", () => {
    expect(() => parseVersionMessage("hand commit\n\nsome text")).toThrow(
      /not a prototype version commit/,
    );
    expect(() => parseVersionMessage("x\n\nPrototype-Kind: sideways")).toThrow(
      /not a prototype version commit/,
    );
  });
});

describe("toSubjectLine", () => {
  test("takes the first non-blank line, squeezed", () => {
    expect(toSubjectLine("\n  make   it\tblue \nsecond", "f")).toBe(
      "make it blue",
    );
  });

  test("cuts at 72 with an ellipsis", () => {
    const subject = toSubjectLine("x".repeat(100), "f");
    expect(subject).toHaveLength(72);
    expect(subject.endsWith("…")).toBe(true);
  });

  test("falls back when nothing is left", () => {
    expect(toSubjectLine("  \n\t", "Agent turn")).toBe("Agent turn");
  });
});
