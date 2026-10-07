import { describe, expect, test } from "bun:test";
import {
  ENTRY_CATEGORY_OPTIONS,
  entryCategory,
  entryExtension,
  entryKindLabel,
} from "./entry-kind";

describe("entryKindLabel", () => {
  test("folders, links and others by kind; files by their type", () => {
    expect(entryKindLabel({ name: "docs", kind: "dir" })).toBe("Folder");
    expect(entryKindLabel({ name: "a.pdf", kind: "symlink" })).toBe("Link");
    expect(entryKindLabel({ name: "sock", kind: "other" })).toBe("Other");
    expect(entryKindLabel({ name: "report.pdf", kind: "file" })).toBe(
      "PDF document",
    );
    expect(entryKindLabel({ name: "blob.qqq", kind: "file" })).toBe("QQQ file");
  });
  test("a directory named like a file is still a folder", () => {
    expect(entryKindLabel({ name: "photos.zip", kind: "dir" })).toBe("Folder");
  });
});

describe("entryCategory", () => {
  test("folds previews into coarse categories", () => {
    expect(entryCategory({ name: "x", kind: "dir" })).toBe("folder");
    expect(entryCategory({ name: "a.png", kind: "file" })).toBe("image");
    expect(entryCategory({ name: "a.pdf", kind: "file" })).toBe("pdf");
    expect(entryCategory({ name: "a.md", kind: "file" })).toBe("document");
    expect(entryCategory({ name: "a.csv", kind: "file" })).toBe("document");
    expect(entryCategory({ name: "a.txt", kind: "file" })).toBe("document");
    expect(entryCategory({ name: "a.ts", kind: "file" })).toBe("code");
    expect(entryCategory({ name: "a.mp4", kind: "file" })).toBe("video");
    expect(entryCategory({ name: "a.mp3", kind: "file" })).toBe("audio");
  });
  test("no preview, a dangling link or another kind is other", () => {
    expect(entryCategory({ name: "a.zip", kind: "file" })).toBe("other");
    expect(entryCategory({ name: "a.png", kind: "symlink" })).toBe("other");
    expect(entryCategory({ name: "fifo", kind: "other" })).toBe("other");
  });
  test("every category has an option", () => {
    const values = new Set(ENTRY_CATEGORY_OPTIONS.map((o) => o.value));
    for (const name of ["x", "a.png", "a.pdf", "a.md", "a.ts", "a.zip"]) {
      expect(values.has(entryCategory({ name, kind: "file" }))).toBe(true);
    }
    expect(values.has("folder")).toBe(true);
  });
});

describe("entryExtension", () => {
  test("the last extension, lowercase", () => {
    expect(entryExtension("Report.PDF")).toBe("pdf");
    expect(entryExtension("a.tar.gz")).toBe("gz");
    expect(entryExtension(".eslintrc.json")).toBe("json");
  });
  test("none for no dot, a bare dotfile or a trailing dot", () => {
    expect(entryExtension("Makefile")).toBeNull();
    expect(entryExtension(".gitignore")).toBeNull();
    expect(entryExtension("weird.")).toBeNull();
  });
});
