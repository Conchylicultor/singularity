import { describe, expect, test } from "bun:test";
import { isSingularityProjectDir } from "./classify-projects";

const REPO = "singularity";

describe("isSingularityProjectDir", () => {
  test("matches the main repo dir", () => {
    expect(
      isSingularityProjectDir("-Users-epot---A---dev-singularity", REPO),
    ).toBe(true);
  });

  test("matches a worktree dir under the main repo", () => {
    expect(
      isSingularityProjectDir(
        "-Users-epot---A---dev-singularity--claude-worktrees-att-1786017041-srcw",
        REPO,
      ),
    ).toBe(true);
  });

  test("rejects an unrelated project dir", () => {
    expect(isSingularityProjectDir("-Users-epot-dev-some-other-repo", REPO)).toBe(
      false,
    );
  });

  test("rejects a repo whose name merely ends with the basename's letters", () => {
    // `-<basename>` requires a separator, so `hypersingularity` is not a match.
    expect(isSingularityProjectDir("-Users-epot-dev-hypersingularity", REPO)).toBe(
      false,
    );
  });

  // The regression this predicate exists for: the answer must not depend on the
  // directory still being present in `~/.claude/projects`. A pure name predicate
  // classifies a long-deleted project exactly as it did while it was live, so
  // archived sessions keep showing up under the default `singularity` scope.
  test("classifies a project whose directory no longer exists on disk", () => {
    const vanished = "-Users-epot---A---dev-singularity--claude-worktrees-gone";
    expect(isSingularityProjectDir(vanished, REPO)).toBe(true);
  });

  // Recorded under a different macOS user (e.g. an older `admin` account): the
  // prefix differs, the tail does not, so it still counts.
  test("ignores the user prefix", () => {
    expect(isSingularityProjectDir("-Users-admin-dev-singularity", REPO)).toBe(
      true,
    );
    expect(
      isSingularityProjectDir(
        "-Users-admin-dev-singularity--claude-worktrees-old-branch",
        REPO,
      ),
    ).toBe(true);
  });

  test("honours a renamed repo basename", () => {
    expect(isSingularityProjectDir("-Users-epot-dev-equin", "equin")).toBe(true);
    expect(isSingularityProjectDir("-Users-epot-dev-equin", REPO)).toBe(false);
  });
});
