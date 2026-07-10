import { test, expect } from "bun:test";
import {
  readStringLiteral,
  parseStringField,
  parseBoolField,
  defaultExportObjectBody,
} from "./helpers";

// ── readStringLiteral: quote forms + round-trip ────────────────────

test("reads all three quote forms", () => {
  expect(readStringLiteral(`"hello"`, 0)).toEqual({ kind: "value", value: "hello", end: 7 });
  expect(readStringLiteral(`'hello'`, 0)).toEqual({ kind: "value", value: "hello", end: 7 });
  expect(readStringLiteral("`hello`", 0)).toEqual({ kind: "value", value: "hello", end: 7 });
});

test("non-quote start → none", () => {
  expect(readStringLiteral("hello", 0)).toEqual({ kind: "none" });
  expect(readStringLiteral("  x", 0)).toEqual({ kind: "none" });
});

test("`end` points just past the closing quote", () => {
  const src = `xx "ab" yy`;
  const r = readStringLiteral(src, 3);
  expect(r).toEqual({ kind: "value", value: "ab", end: 7 });
  expect(src[r.kind === "value" ? r.end : -1]).toBe(" ");
});

// ── the reported bug: embedded escaped quotes ──────────────────────

test('double-quoted value with escaped quotes round-trips WITH the quotes', () => {
  // `"a onDelete:\"cascade\" bound"` — the exact reported bug.
  const src = '"a onDelete:\\"cascade\\" bound"';
  expect(readStringLiteral(src, 0)).toEqual({
    kind: "value",
    value: 'a onDelete:"cascade" bound',
    end: src.length,
  });
});

test("apostrophes across quote forms", () => {
  expect(readStringLiteral("'it\\'s'", 0)).toEqual({ kind: "value", value: "it's", end: 7 });
  expect(readStringLiteral(`"it's"`, 0)).toEqual({ kind: "value", value: "it's", end: 6 });
});

// ── escape cooking ─────────────────────────────────────────────────

test("cooks standard escapes", () => {
  expect(readStringLiteral('"a\\nb"', 0)).toMatchObject({ value: "a\nb" });
  expect(readStringLiteral('"a\\\\b"', 0)).toMatchObject({ value: "a\\b" });
  expect(readStringLiteral('"a\\tb"', 0)).toMatchObject({ value: "a\tb" });
});

test("cooks \\xHH, \\uHHHH, \\u{...}", () => {
  expect(readStringLiteral('"\\x41"', 0)).toMatchObject({ value: "A" });
  expect(readStringLiteral('"\\u0041"', 0)).toMatchObject({ value: "A" });
  expect(readStringLiteral('"\\u{1F600}"', 0)).toMatchObject({ value: "\u{1F600}" });
});

test("unknown escape yields the char itself", () => {
  expect(readStringLiteral('"\\q"', 0)).toMatchObject({ value: "q" });
});

test("line continuation decodes to nothing", () => {
  expect(readStringLiteral('"a\\\nb"', 0)).toMatchObject({ value: "ab" });
});

// ── backtick specifics ─────────────────────────────────────────────

// Built by concatenation rather than written inline: a literal `${` inside a
// plain string trips the `no-template-curly-in-string` lint rule, which cannot
// tell a fixture apart from a template literal someone quoted by mistake.
const OPEN_INTERP = "$" + "{";

test("backtick with unescaped interpolation → dynamic", () => {
  const r = readStringLiteral("`hi " + OPEN_INTERP + "x} there`", 0);
  expect(r.kind).toBe("dynamic");
});

test("backtick with escaped interpolation → value", () => {
  const r = readStringLiteral("`hi \\" + OPEN_INTERP + "x}`", 0);
  expect(r).toMatchObject({ kind: "value", value: "hi " + OPEN_INTERP + "x}" });
});

test("backtick multi-line → whitespace collapsed", () => {
  const r = readStringLiteral("`line one\n  line two`", 0);
  expect(r).toMatchObject({ kind: "value", value: "line one line two" });
});

test("double-quoted \\n is NOT collapsed (stays a real newline)", () => {
  const r = readStringLiteral('"line one\\n  line two"', 0);
  expect(r).toMatchObject({ kind: "value", value: "line one\n  line two" });
});

test("unterminated literal → dynamic, no hang/throw", () => {
  const r = readStringLiteral('"never closed', 0);
  expect(r.kind).toBe("dynamic");
});

// ── parseStringField ───────────────────────────────────────────────

test("reads a plain string field", () => {
  expect(parseStringField(`{ description: "hi" }`, "description")).toEqual({
    kind: "value",
    value: "hi",
  });
});

test("field value with embedded escaped quotes (the docs bug)", () => {
  const src = 'x = { description: "a onDelete:\\"cascade\\" bound" }';
  expect(parseStringField(src, "description")).toEqual({
    kind: "value",
    value: 'a onDelete:"cascade" bound',
  });
});

test("identifier value → dynamic with expr", () => {
  expect(parseStringField(`{ description: MY_CONST }`, "description")).toEqual({
    kind: "dynamic",
    expr: "MY_CONST",
  });
});

test("call value → dynamic", () => {
  expect(parseStringField(`{ description: makeIt("x") }`, "description")).toMatchObject({
    kind: "dynamic",
  });
});

test("absent key → absent", () => {
  expect(parseStringField(`{ name: "x" }`, "description")).toEqual({ kind: "absent" });
});

test("description: inside a // comment → absent", () => {
  expect(parseStringField(`// description: "commented"\n{ name: "x" }`, "description")).toEqual({
    kind: "absent",
  });
});

test("description: inside a /* */ comment → absent", () => {
  expect(parseStringField(`/* description: "commented" */\n{ name: "x" }`, "description")).toEqual({
    kind: "absent",
  });
});

test("description: inside a string literal → absent", () => {
  expect(parseStringField(`{ note: "description: not real" }`, "description")).toEqual({
    kind: "absent",
  });
});

// ── depth0 scoping ─────────────────────────────────────────────────

test("depth0: nested description does not shadow a later top-level one", () => {
  const body = `contribs: [{ description: "inner" }], description: "outer"`;
  expect(parseStringField(body, "description", { depth0: true })).toEqual({
    kind: "value",
    value: "outer",
  });
});

test("depth0: only a nested key present → absent", () => {
  const body = `contribs: [{ description: "inner" }], name: "top"`;
  expect(parseStringField(body, "description", { depth0: true })).toEqual({ kind: "absent" });
});

test("without depth0: first match anywhere wins (nested included)", () => {
  const body = `contribs: [{ description: "inner" }], description: "outer"`;
  expect(parseStringField(body, "description")).toEqual({ kind: "value", value: "inner" });
});

// ── parseBoolField ─────────────────────────────────────────────────

test("parseBoolField reads true/false and defaults false when absent", () => {
  expect(parseBoolField(`{ loadBearing: true }`, "loadBearing")).toBe(true);
  expect(parseBoolField(`{ loadBearing: false }`, "loadBearing")).toBe(false);
  expect(parseBoolField(`{ name: "x" }`, "loadBearing")).toBe(false);
});

test("parseBoolField depth0: nested flag does not leak", () => {
  const body = `contribs: [{ loadBearing: true }], name: "x"`;
  expect(parseBoolField(body, "loadBearing", { depth0: true })).toBe(false);
});

test("parseBoolField ignores a flag inside a comment", () => {
  expect(parseBoolField(`// loadBearing: true\n{ name: "x" }`, "loadBearing")).toBe(false);
});

// ── defaultExportObjectBody ────────────────────────────────────────

test("isolates a normal barrel's default-export object body", () => {
  const src = `import x from "y";\nexport default { name: "foo", loadBearing: true };`;
  const r = defaultExportObjectBody(src);
  expect(r.kind).toBe("object");
  expect(r.kind === "object" && r.body).toContain(`name: "foo"`);
});

test("export default {} → object with EMPTY body (not absent)", () => {
  expect(defaultExportObjectBody(`export default {}`)).toEqual({ kind: "object", body: "" });
});

test("no default export → absent", () => {
  expect(defaultExportObjectBody(`export const x = 1;`)).toEqual({ kind: "absent" });
});

test("export default that is not an object → absent", () => {
  expect(defaultExportObjectBody(`export default makePlugin();`)).toEqual({ kind: "absent" });
});

test("export default inside a comment → absent", () => {
  expect(defaultExportObjectBody(`// export default { x: 1 }\nexport const y = 2;`)).toEqual({
    kind: "absent",
  });
});
