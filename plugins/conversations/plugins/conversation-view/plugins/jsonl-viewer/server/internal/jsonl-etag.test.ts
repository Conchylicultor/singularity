import { describe, expect, test } from "bun:test";
import { jsonlEtag } from "./jsonl-etag";

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
