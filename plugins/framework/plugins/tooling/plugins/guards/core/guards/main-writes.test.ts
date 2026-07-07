import { describe, expect, test } from "bun:test";
import { createContext } from "../context";
import type { Verdict } from "../types";
import { mainWritesGuard } from "./main-writes";

const REPO = "/Users/u/dev/repo";
const WT = `${REPO}/.claude/worktrees/att-123-abcd`;

function verdict(command: string, cwd: string): Verdict {
  // Synchronous check; the fake cwd never holds a bypass token file.
  return mainWritesGuard.check({ command }, createContext(cwd)) as Verdict;
}
const blocks = (command: string, cwd: string) => verdict(command, cwd).kind === "deny";

describe("main-writes guard", () => {
  describe("boundaries derive from the worktree marker, not raw cwd", () => {
    test("blocks a cp into the main checkout from the worktree root", () => {
      expect(blocks(`cp file.ts ${REPO}/plugins/file.ts`, WT)).toBe(true);
    });

    test("still blocks it when cwd is a worktree SUBDIRECTORY (old code mis-derived the repo root and let it through)", () => {
      expect(blocks(`cp file.ts ${REPO}/plugins/file.ts`, `${WT}/gateway`)).toBe(true);
    });

    test("allows writes to a sibling dir of the agent's own worktree from a subdirectory cwd (old false positive)", () => {
      expect(blocks(`cp notes.md ../research/notes.md`, `${WT}/gateway`)).toBe(false);
    });

    test("blocks a redirection into the main checkout from a subdirectory cwd", () => {
      expect(blocks(`echo x > ${REPO}/notes.txt`, `${WT}/gateway`)).toBe(true);
    });

    test("blocks git -C <main repo> mutations from inside the worktree", () => {
      expect(blocks(`git -C ${REPO} commit -m x`, `${WT}/gateway`)).toBe(true);
    });
  });

  describe("stays inert where it should", () => {
    test("non-worktree session (cwd in the main checkout)", () => {
      expect(blocks(`cp a.ts ${REPO}/plugins/a.ts`, REPO)).toBe(false);
    });

    test("writes outside the repo entirely", () => {
      expect(blocks(`cp a.ts /tmp/a.ts`, `${WT}/gateway`)).toBe(false);
    });

    test("writes within the worktree", () => {
      expect(blocks(`mkdir -p research && touch research/x.md`, WT)).toBe(false);
    });
  });
});
