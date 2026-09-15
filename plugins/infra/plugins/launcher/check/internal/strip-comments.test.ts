import { describe, expect, test } from "bun:test";
import { stripComments } from "./strip-comments";

/** The words left in `code` once its comments are stripped. */
function words(path: string, code: string): string[] {
  return stripComments(path, code).match(/[A-Za-z_]+/g) ?? [];
}

describe("stripComments keeps length and line numbers", () => {
  test.each([
    ["a.ts", "const a = 1; // KEEP_OUT\n/* x\n y */ const b = 2;\n"],
    ["a.go", 'x := 1 // KEEP_OUT\n/* a\n b */ y := "s"\n'],
    [".githooks/h", "echo hi # KEEP_OUT\n# whole line\nexit 0\n"],
  ])("%s", (path, code) => {
    const stripped = stripComments(path, code);
    expect(stripped.length).toBe(code.length);
    expect(stripped.split("\n").length).toBe(code.split("\n").length);
  });
});

describe("TypeScript", () => {
  test("drops line, block and JSDoc comments; keeps code, strings and templates", () => {
    const code = [
      "/** Reads IN_JSDOC. */",
      "export function f(): string | undefined {",
      "  // IN_LINE_COMMENT",
      // A template literal holding the fixture's own template literal, so its
      // `${…}` stays text here and is code in the fixture.
      `  const t = \`IN_TEMPLATE \${1}\`; /* IN_BLOCK */`,
      '  return process.env.IN_CODE ?? "IN_STRING";',
      "}",
      "// IN_EOF_COMMENT",
    ].join("\n");
    const kept = words("a.ts", code);
    expect(kept).toContain("IN_CODE");
    expect(kept).toContain("IN_STRING");
    expect(kept).toContain("IN_TEMPLATE");
    for (const gone of [
      "IN_JSDOC",
      "IN_LINE_COMMENT",
      "IN_BLOCK",
      "IN_EOF_COMMENT",
    ]) {
      expect(kept).not.toContain(gone);
    }
  });

  test("a // inside a string or a regex literal is not a comment", () => {
    const code = [
      'const url = "http://host/AFTER_URL";',
      "const re = /a\\/\\/b/; const AFTER_REGEX = 1;",
    ].join("\n");
    const kept = words("a.ts", code);
    expect(kept).toContain("AFTER_URL");
    expect(kept).toContain("AFTER_REGEX");
  });

  test("a comment in an empty block and a JSX comment are dropped", () => {
    expect(words("a.ts", "function g() { /* IN_EMPTY */ }")).not.toContain(
      "IN_EMPTY",
    );
    const jsx = "const el = <div>{/* IN_JSX */}<b>JSX_TEXT</b></div>;";
    const kept = words("a.tsx", jsx);
    expect(kept).not.toContain("IN_JSX");
    expect(kept).toContain("JSX_TEXT");
  });
});

describe("Go and Rust", () => {
  test("drops comments; keeps strings, raw strings and runes", () => {
    const code = [
      "// IN_LINE_COMMENT",
      'a := os.Getenv("IN_STRING") // IN_TRAILING',
      "b := `IN_RAW // STILL_RAW`",
      "c := '\"' ; d := IN_CODE /* IN_BLOCK */",
      'e := "http://AFTER_URL"',
    ].join("\n");
    const kept = words("gateway/x.go", code);
    for (const k of ["IN_STRING", "IN_RAW", "STILL_RAW", "IN_CODE"]) {
      expect(kept).toContain(k);
    }
    expect(kept).toContain("AFTER_URL");
    for (const gone of ["IN_LINE_COMMENT", "IN_TRAILING", "IN_BLOCK"]) {
      expect(kept).not.toContain(gone);
    }
  });

  test("a Rust lifetime is not a char literal", () => {
    const code = "fn f<'a>(x: &'a str) { g(\"IN_STRING\") } // IN_COMMENT";
    const kept = words("tauri/src/lib.rs", code);
    expect(kept).toContain("IN_STRING");
    expect(kept).not.toContain("IN_COMMENT");
  });
});

describe("shell", () => {
  test("drops # comments at a word start; keeps a quoted #, $# and a length expansion", () => {
    const code = [
      "# IN_COMMENT",
      `echo "# IN_DQ" '# IN_SQ' $# \${#IN_PARAM} # IN_TRAILING`,
      '[ -n "$IN_CODE" ] && exit 0',
    ].join("\n");
    const kept = words(".githooks/prepare-commit-msg", code);
    for (const k of ["IN_DQ", "IN_SQ", "IN_PARAM", "IN_CODE"]) {
      expect(kept).toContain(k);
    }
    for (const gone of ["IN_COMMENT", "IN_TRAILING"]) {
      expect(kept).not.toContain(gone);
    }
  });
});

test("an unknown file kind throws instead of being scanned as comment-free", () => {
  expect(() => stripComments("notes.py", "# x")).toThrow(/no comment syntax/);
});
