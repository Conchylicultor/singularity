import { describe, expect, test } from "bun:test";
import { opMarkerSlug } from "./signals";

describe("opMarkerSlug", () => {
  const root = "/data/worktrees";

  test("a marker file names its worktree", () => {
    expect(opMarkerSlug(root, "/data/worktrees/att-1-x/ops/op-9.json")).toBe(
      "att-1-x",
    );
  });

  test("anything else under the root is not a marker", () => {
    expect(
      opMarkerSlug(root, "/data/worktrees/att-1-x/build-status.json"),
    ).toBe(null);
    expect(
      opMarkerSlug(root, "/data/worktrees/att-1-x/ops/op-9.json.123.tmp"),
    ).toBe(null);
    expect(opMarkerSlug(root, "/data/worktrees/att-1-x/ops/a/b.json")).toBe(
      null,
    );
    expect(opMarkerSlug(root, "/elsewhere/att-1-x/ops/op-9.json")).toBe(null);
  });
});
