import { describe, expect, test } from "bun:test";
import { namespaceCollision, type NamespaceProbe } from "./composition-namespace";

describe("namespaceCollision", () => {
  const clean: NamespaceProbe = {
    specDirExists: false,
    hasCompositionMarker: false,
    gitWorktreeDirExists: false,
    branchExists: false,
  };

  test("fresh namespace → no collision", () => {
    expect(namespaceCollision("sonata", clean)).toBeNull();
  });

  test("re-serving our own marker-carrying namespace → no collision", () => {
    expect(
      namespaceCollision("sonata", { ...clean, specDirExists: true, hasCompositionMarker: true }),
    ).toBeNull();
  });

  test("spec dir without our marker → collision (never overwrite a foreign namespace)", () => {
    expect(namespaceCollision("sonata", { ...clean, specDirExists: true })).toContain("WITHOUT");
  });

  test("same-named git worktree checkout or branch → collision", () => {
    expect(
      namespaceCollision("sonata", { ...clean, gitWorktreeDirExists: true }),
    ).toContain("worktree");
    expect(namespaceCollision("sonata", { ...clean, branchExists: true })).toContain("branch");
  });
});
