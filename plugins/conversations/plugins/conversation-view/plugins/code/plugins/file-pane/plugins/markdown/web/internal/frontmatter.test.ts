import { describe, expect, it } from "bun:test";
import { splitFrontmatter } from "./frontmatter";

describe("splitFrontmatter", () => {
  it("returns null without a frontmatter fence", () => {
    expect(splitFrontmatter("# Title\n\nbody")).toBeNull();
  });

  it("returns null for a fence with no parseable key", () => {
    expect(splitFrontmatter("---\njust text\n---\nbody")).toBeNull();
  });

  it("parses flat key: value pairs and the trailing body", () => {
    const result = splitFrontmatter('---\nname: foo\ntitle: "Bar"\n---\n# Body\n');
    expect(result).toEqual({
      fields: [
        { key: "name", value: "foo" },
        { key: "title", value: "Bar" },
      ],
      body: "# Body\n",
    });
  });

  it("folds a `>` block scalar into one space-joined value (no leading `>`)", () => {
    const result = splitFrontmatter(
      "---\n" +
        "name: perfs-investigation\n" +
        "description: >\n" +
        "  Methodology for performance investigations. Read BEFORE any\n" +
        "  profiling pass, or perf fix.\n" +
        "---\n" +
        "body",
    );
    expect(result?.fields).toEqual([
      { key: "name", value: "perfs-investigation" },
      {
        key: "description",
        value:
          "Methodology for performance investigations. Read BEFORE any profiling pass, or perf fix.",
      },
    ]);
  });

  it("handles literal/chomped block-scalar headers (`|-`, `>2`)", () => {
    const result = splitFrontmatter(
      "---\na: |-\n  one\n  two\nb: >2\n  three\n---\nbody",
    );
    expect(result?.fields).toEqual([
      { key: "a", value: "one two" },
      { key: "b", value: "three" },
    ]);
  });

  it("still comma-joins list items", () => {
    const result = splitFrontmatter(
      "---\ntags:\n  - alpha\n  - beta\n---\nbody",
    );
    expect(result?.fields).toEqual([{ key: "tags", value: "alpha, beta" }]);
  });
});
