import { describe, expect, test } from "bun:test";
import { classifyTreePath } from "./tree-path";

const ROOT = "/data/apps/prototypes";
const ID = "proto-1789000000-abcd";

describe("classifyTreePath", () => {
  test("a history's latest stamp is a recorded version of that id", () => {
    expect(
      classifyTreePath(ROOT, `${ROOT}/_history/${ID}.git/latest.json`),
    ).toEqual({ kind: "version-recorded", id: ID });
  });

  test("anything else under _history is internal", () => {
    for (const path of [
      `${ROOT}/_history/.staging-${ID}-x1/latest.json`,
      `${ROOT}/_history/${ID}.git/info/latest.json`,
      `${ROOT}/_history/not-an-id.git/latest.json`,
      `${ROOT}/_history/${ID}.lock`,
    ]) {
      expect(classifyTreePath(ROOT, path)).toEqual({
        kind: "history-internal",
      });
    }
  });

  test("a prototype's files and the template are the tree", () => {
    expect(classifyTreePath(ROOT, `${ROOT}/${ID}/index.html`)).toEqual({
      kind: "tree",
    });
    expect(classifyTreePath(ROOT, `${ROOT}/_template/index.html`)).toEqual({
      kind: "tree",
    });
  });
});
