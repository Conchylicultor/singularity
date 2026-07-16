import { describe, expect, test } from "bun:test";
import { decidePaste } from "./clipboard";

describe("decidePaste", () => {
  test("a pasted file defers to the attachment paste handler", () => {
    expect(
      decidePaste({ isFile: true, blocksJson: "[]", plainText: "a\nb" }),
    ).toEqual({ kind: "defer" });
  });

  test("a BLOCKS_MIME payload beats plain text", () => {
    expect(
      decidePaste({ isFile: false, blocksJson: '[{"type":"page.text"}]', plainText: "hi" }),
    ).toEqual({ kind: "forest", json: '[{"type":"page.text"}]' });
  });

  test("multi-line plain text parses as markdown", () => {
    expect(
      decidePaste({ isFile: false, blocksJson: "", plainText: "# H\n- a" }),
    ).toEqual({ kind: "markdown", text: "# H\n- a" });
  });

  test("single-line plain text stays a native inline paste", () => {
    expect(
      decidePaste({ isFile: false, blocksJson: "", plainText: "just one line" }),
    ).toEqual({ kind: "default" });
  });

  test("empty clipboard stays default", () => {
    expect(
      decidePaste({ isFile: false, blocksJson: "", plainText: "" }),
    ).toEqual({ kind: "default" });
  });
});
