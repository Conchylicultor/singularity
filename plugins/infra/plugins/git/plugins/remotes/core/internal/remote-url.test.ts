import { describe, expect, test } from "bun:test";
import { normalizeRepoUrl, sameRepoUrl } from "./remote-url";

const CANONICAL = "https://github.com/Conchylicultor/singularity";

describe("normalizeRepoUrl", () => {
  test("reads scp-like syntax, which is not a URL", () => {
    expect(normalizeRepoUrl("git@github.com:Owner/repo.git")).toEqual({
      kind: "parsed",
      host: "github.com",
      path: "owner/repo",
    });
  });

  test("reads https, dropping the .git and the trailing slash", () => {
    expect(normalizeRepoUrl("https://github.com/Owner/repo.git/")).toEqual({
      kind: "parsed",
      host: "github.com",
      path: "owner/repo",
    });
  });

  test("reads ssh:// with a port", () => {
    expect(
      normalizeRepoUrl("ssh://git@git.example.com:2222/owner/repo"),
    ).toEqual({ kind: "parsed", host: "git.example.com", path: "owner/repo" });
  });

  // A local path is a repository this module cannot identify beyond its text —
  // resolving symlinks to decide otherwise is not its job.
  test("a local path stays opaque", () => {
    expect(normalizeRepoUrl("/tmp/upstream.git")).toEqual({
      kind: "opaque",
      raw: "/tmp/upstream.git",
    });
    expect(normalizeRepoUrl("../sibling")).toEqual({
      kind: "opaque",
      raw: "../sibling",
    });
  });
});

describe("sameRepoUrl", () => {
  test("the four spellings of one repo are one repo", () => {
    for (const spelling of [
      "https://github.com/Conchylicultor/singularity.git",
      "https://github.com/conchylicultor/singularity/",
      "git@github.com:Conchylicultor/singularity.git",
      "ssh://git@github.com/Conchylicultor/singularity",
    ]) {
      expect(sameRepoUrl(spelling, CANONICAL)).toBe(true);
    }
  });

  test("a fork is not the canonical repo", () => {
    expect(
      sameRepoUrl("git@github.com:someone/singularity.git", CANONICAL),
    ).toBe(false);
  });

  test("a different host is a different repo", () => {
    expect(
      sameRepoUrl("https://gitlab.com/Conchylicultor/singularity", CANONICAL),
    ).toBe(false);
  });

  test("two local paths compare as text, and never as equal to a URL", () => {
    expect(sameRepoUrl("/tmp/up.git", "/tmp/up.git")).toBe(true);
    expect(sameRepoUrl("/tmp/up.git", "/tmp/other.git")).toBe(false);
    expect(sameRepoUrl("/tmp/up.git", CANONICAL)).toBe(false);
  });
});
