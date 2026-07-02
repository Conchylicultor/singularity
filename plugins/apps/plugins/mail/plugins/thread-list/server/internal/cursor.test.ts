import { describe, expect, test } from "bun:test";
import { encodeThreadCursor, decodeThreadCursor } from "./cursor";

describe("mail thread cursor", () => {
  test("round-trips sortMs + id", () => {
    const cases: [number, string][] = [
      [0, "abc"],
      [1719900000000, "thread_1a2b3c"],
      [42, "x"],
    ];
    for (const [sortMs, id] of cases) {
      expect(decodeThreadCursor(encodeThreadCursor(sortMs, id))).toEqual({
        sortMs,
        id,
      });
    }
  });

  test("splits on the FIRST colon, so an id with colons survives", () => {
    const enc = encodeThreadCursor(5, "weird:id:with:colons");
    expect(decodeThreadCursor(enc)).toEqual({
      sortMs: 5,
      id: "weird:id:with:colons",
    });
  });

  test("throws on a malformed cursor", () => {
    const noColon = Buffer.from("nocolon").toString("base64url");
    const notANumber = Buffer.from("notanumber:id").toString("base64url");
    const emptyId = Buffer.from("123:").toString("base64url");
    expect(() => decodeThreadCursor(noColon)).toThrow();
    expect(() => decodeThreadCursor(notANumber)).toThrow();
    expect(() => decodeThreadCursor(emptyId)).toThrow();
  });
});
