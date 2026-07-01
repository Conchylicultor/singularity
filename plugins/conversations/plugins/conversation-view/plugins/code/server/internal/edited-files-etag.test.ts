import { describe, expect, test } from "bun:test";
import { type DirtyEntry, editedFilesEtag, parsePorcelainZ } from "./edited-files-etag";

const HEAD_A = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const HEAD_B = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const BASE_A = "1111111111111111111111111111111111111111";
const BASE_B = "2222222222222222222222222222222222222222";

function entry(over: Partial<DirtyEntry> = {}): DirtyEntry {
  return { code: " M", path: "src/a.ts", mtimeMs: 1000, size: 50, ...over };
}

describe("parsePorcelainZ", () => {
  test("null / empty ⇒ no entries", () => {
    expect(parsePorcelainZ(null)).toEqual([]);
    expect(parsePorcelainZ("")).toEqual([]);
  });

  test("splits NUL-delimited XY<space>path tokens", () => {
    const out = " M src/a.ts\0?? new file.ts\0D  gone.ts\0";
    expect(parsePorcelainZ(out)).toEqual([
      { code: " M", path: "src/a.ts" },
      { code: "??", path: "new file.ts" },
      { code: "D ", path: "gone.ts" },
    ]);
  });

  test("preserves paths containing spaces (no unquoting needed under -z)", () => {
    expect(parsePorcelainZ("?? a b c.ts\0")).toEqual([{ code: "??", path: "a b c.ts" }]);
  });
});

describe("editedFilesEtag", () => {
  test("identical inputs ⇒ identical string", () => {
    const e = [entry()];
    expect(editedFilesEtag(HEAD_A, BASE_A, e)).toBe(editedFilesEtag(HEAD_A, BASE_A, e));
  });

  test("a changed headSha ⇒ a different string (committed diff)", () => {
    expect(editedFilesEtag(HEAD_A, BASE_A, [entry()])).not.toBe(
      editedFilesEtag(HEAD_B, BASE_A, [entry()]),
    );
  });

  test("a changed mergeBase ⇒ a different string (main advanced)", () => {
    expect(editedFilesEtag(HEAD_A, BASE_A, [entry()])).not.toBe(
      editedFilesEtag(HEAD_A, BASE_B, [entry()]),
    );
  });

  test("a dirty file's size change ⇒ a different string (numstat moved)", () => {
    // The trap: porcelain code stays " M" but content grew, so size changes.
    expect(editedFilesEtag(HEAD_A, BASE_A, [entry({ size: 50 })])).not.toBe(
      editedFilesEtag(HEAD_A, BASE_A, [entry({ size: 80 })]),
    );
  });

  test("a dirty file's mtime change ⇒ a different string", () => {
    expect(editedFilesEtag(HEAD_A, BASE_A, [entry({ mtimeMs: 1000 })])).not.toBe(
      editedFilesEtag(HEAD_A, BASE_A, [entry({ mtimeMs: 2000 })]),
    );
  });

  test("a status-code change ⇒ a different string (e.g. M → D)", () => {
    expect(editedFilesEtag(HEAD_A, BASE_A, [entry({ code: " M" })])).not.toBe(
      editedFilesEtag(HEAD_A, BASE_A, [entry({ code: "D " })]),
    );
  });

  test("adding a dirty file ⇒ a different string", () => {
    expect(editedFilesEtag(HEAD_A, BASE_A, [entry()])).not.toBe(
      editedFilesEtag(HEAD_A, BASE_A, [entry(), entry({ path: "src/b.ts" })]),
    );
  });

  test("entry order does not affect the signature (sorted by path)", () => {
    const a = entry({ path: "src/a.ts" });
    const b = entry({ path: "src/b.ts" });
    expect(editedFilesEtag(HEAD_A, BASE_A, [a, b])).toBe(
      editedFilesEtag(HEAD_A, BASE_A, [b, a]),
    );
  });

  test("clean worktree fingerprint differs from a dirty one", () => {
    expect(editedFilesEtag(HEAD_A, BASE_A, [])).not.toBe(
      editedFilesEtag(HEAD_A, BASE_A, [entry()]),
    );
  });

  test("a path containing the field delimiter is not confused with fields", () => {
    // ':' can appear in a path; layout puts path last so it can't collide.
    expect(editedFilesEtag(HEAD_A, BASE_A, [entry({ path: "a:b:c.ts" })])).not.toBe(
      editedFilesEtag(HEAD_A, BASE_A, [entry({ path: "a", size: 50 })]),
    );
  });
});
