import { describe, expect, test } from "bun:test";
import { INLINE_MATH_TOKEN_PATTERN, inlineMathToken } from "./tokens";

// Mirrors the editor's appendLineNodes scan: global, first-match-wins, then the
// surrounding text is preserved. This is the exact round-trip a stored block text
// goes through on reload.
function roundTrip(line: string): string {
  const re = new RegExp(INLINE_MATH_TOKEN_PATTERN.source, "g");
  let out = "";
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line)) !== null) {
    out += line.slice(last, m.index);
    out += inlineMathToken(m[1]!); // re-serialize the parsed expression
    last = m.index + m[0].length;
  }
  out += line.slice(last);
  return out;
}

describe("inline math token", () => {
  test("serializes to LaTeX inline delimiters", () => {
    expect(inlineMathToken("E = mc^2")).toBe(String.raw`\(E = mc^2\)`);
  });

  test("round-trips an expression with backslash macros (e.g. \\pi)", () => {
    const line = String.raw`Euler: ${inlineMathToken("e^{i\\pi}+1=0")} is beautiful.`;
    expect(roundTrip(line)).toBe(line);
    const m = new RegExp(INLINE_MATH_TOKEN_PATTERN.source).exec(line);
    expect(m?.[1]).toBe("e^{i\\pi}+1=0");
  });

  test("extracts the expression, not the delimiters", () => {
    const m = INLINE_MATH_TOKEN_PATTERN.exec(inlineMathToken("a^2+b^2=c^2"));
    expect(m?.[1]).toBe("a^2+b^2=c^2");
  });

  test("two tokens on one line stay independent (lazy match, no merge)", () => {
    const line = `${inlineMathToken("x")} and ${inlineMathToken("y")}`;
    const matches = [...line.matchAll(new RegExp(INLINE_MATH_TOKEN_PATTERN.source, "g"))];
    expect(matches.map((m) => m[1])).toEqual(["x", "y"]);
    expect(roundTrip(line)).toBe(line);
  });

  test("collision-safe: a single dollar in prose is never matched as math", () => {
    expect(INLINE_MATH_TOKEN_PATTERN.test("it cost $5 and $10")).toBe(false);
  });

  test("does not match across a newline", () => {
    expect(INLINE_MATH_TOKEN_PATTERN.test("\\(a\n b\\)")).toBe(false);
  });
});
