import { describe, expect, test } from "bun:test";
import { jsonlEtag, jsonlChainEtag } from "./jsonl-etag";

const PATH_A = "/projects/proj/session-a.jsonl";
const PATH_B = "/projects/proj/session-b.jsonl";

describe("jsonlEtag", () => {
  test("identical inputs ⇒ identical string", () => {
    expect(jsonlEtag(PATH_A, 1000, 4096)).toBe(jsonlEtag(PATH_A, 1000, 4096));
  });

  test("a grown transcript (size change) ⇒ a different string", () => {
    expect(jsonlEtag(PATH_A, 1000, 4096)).not.toBe(jsonlEtag(PATH_A, 1000, 8192));
  });

  test("an mtime change ⇒ a different string", () => {
    expect(jsonlEtag(PATH_A, 1000, 4096)).not.toBe(jsonlEtag(PATH_A, 2000, 4096));
  });

  test("a resolved-path change ⇒ a different string", () => {
    expect(jsonlEtag(PATH_A, 1000, 4096)).not.toBe(jsonlEtag(PATH_B, 1000, 4096));
  });

  test("mtime and size are not conflated", () => {
    expect(jsonlEtag(PATH_A, 4096, 1000)).not.toBe(jsonlEtag(PATH_A, 1000, 4096));
  });
});

describe("jsonlChainEtag", () => {
  const fileA = { path: PATH_A, mtimeMs: 1000, size: 4096 };
  const fileB = { path: PATH_B, mtimeMs: 2000, size: 8192 };

  test("an empty chain ⇒ \"none\"", () => {
    expect(jsonlChainEtag(0, [])).toBe("none");
  });

  test("identical chains ⇒ identical string", () => {
    expect(jsonlChainEtag(2, [fileA, fileB])).toBe(jsonlChainEtag(2, [fileA, fileB]));
  });

  test("an append to any chain file ⇒ a different string", () => {
    const grown = { ...fileA, mtimeMs: 1500, size: 5000 };
    expect(jsonlChainEtag(2, [fileA, fileB])).not.toBe(jsonlChainEtag(2, [grown, fileB]));
  });

  test("a NEW chain entry ⇒ a different string", () => {
    expect(jsonlChainEtag(1, [fileA])).not.toBe(jsonlChainEtag(2, [fileA, fileB]));
  });

  test("a chain file vanishing under us ⇒ a different string", () => {
    expect(jsonlChainEtag(2, [fileA, fileB])).not.toBe(jsonlChainEtag(2, [fileA]));
  });

  test("a vanished tail never collides with a genuinely shorter chain", () => {
    // Chain of 2 whose second file is gone must not look like a chain of 1.
    expect(jsonlChainEtag(2, [fileA])).not.toBe(jsonlChainEtag(1, [fileA]));
  });

  test("chain order is significant", () => {
    expect(jsonlChainEtag(2, [fileA, fileB])).not.toBe(jsonlChainEtag(2, [fileB, fileA]));
  });

  test("a non-empty chain never looks empty", () => {
    expect(jsonlChainEtag(1, [])).not.toBe("none");
  });
});
