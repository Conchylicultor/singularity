import { describe, it, expect } from "bun:test";
import { splitTopLevelStatements, extractFromSpecifier } from "./parse";

describe("splitTopLevelStatements — string safety", () => {
  it("does not mis-split on braces/semicolons inside a template literal", () => {
    // The template literal carries `{`, `}`, and `;` — a string-naive depth
    // counter would treat those as real structure and shatter the statement.
    const src = "const q = `SELECT {a}; {b}`;\nconst next = 1;\n";
    const stmts = splitTopLevelStatements(src).filter((s) => s.text.trim());
    const texts = stmts.map((s) => s.text.trim());
    expect(texts).toContain("const q = `SELECT {a}; {b}`");
    expect(texts).toContain("const next = 1");
    // The template must survive whole — never split at its inner `;`.
    expect(texts.some((t) => t.includes("SELECT {a}; {b}"))).toBe(true);
  });

  it("keeps string interiors (specifiers survive) while masking comments", () => {
    const src = [
      'import { foo } from "@plugins/other/core"; // trailing comment',
      "const s = `a;b{c}`;",
    ].join("\n");
    const stmts = splitTopLevelStatements(src).filter((s) => s.text.trim());
    const importStmt = stmts.find((s) => s.text.includes("import"));
    expect(importStmt).toBeDefined();
    // Comment stripped, specifier kept → extractFromSpecifier reads the real path.
    expect(extractFromSpecifier(importStmt!.text.trim())).toBe("@plugins/other/core");
  });

  it("does not split imports whose specifier embeds a semicolon", () => {
    // Pathological but legal: a semicolon inside the module specifier string.
    const src = 'import x from "a;b";\nimport y from "c";\n';
    const stmts = splitTopLevelStatements(src).filter((s) => s.text.trim());
    const specs = stmts.map((s) => extractFromSpecifier(s.text.trim()));
    expect(specs).toContain("a;b");
    expect(specs).toContain("c");
  });
});
