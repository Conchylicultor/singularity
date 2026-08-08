import { describe, expect, test } from "bun:test";
import { createContext } from "../context";
import type { Verdict } from "../types";
import { backgroundOpsGuard } from "./background-ops";

function verdict(command: string, run_in_background?: boolean): Verdict {
  return backgroundOpsGuard.check(
    { command, run_in_background },
    createContext("/tmp"),
  ) as Verdict;
}

const blocks = (command: string, bg?: boolean) =>
  verdict(command, bg).kind === "deny";
const reason = (command: string, bg?: boolean) => {
  const v = verdict(command, bg);
  return v.kind === "deny" ? v.reason : "";
};

describe("background-ops guard", () => {
  describe("long ops in the foreground are blocked", () => {
    for (const op of ["build", "push", "check", "test", "release"]) {
      test(`./singularity ${op}`, () => {
        expect(blocks(`./singularity ${op}`)).toBe(true);
      });
    }

    test("the exact shape from conv-1786116592-b70n", () => {
      expect(
        blocks(
          `./singularity push -m "feat(data-view): properties" 2>&1 | tail -50`,
        ),
      ).toBe(true);
    });

    test("behind a cd, as agents usually write it", () => {
      expect(
        blocks(
          // Fake root, deliberately not under /Users — see `paths:no-hardcoded-paths`.
          `cd /r/repo/.claude/worktrees/att-1 && ./singularity build`,
        ),
      ).toBe(true);
    });

    test("hidden inside a loop body — the parseShell blind spot", () => {
      expect(blocks(`until false; do ./singularity build; done`)).toBe(true);
    });

    test("the denial names run_in_background", () => {
      expect(reason("./singularity build")).toContain("run_in_background");
    });
  });

  describe("backgrounded long ops are allowed", () => {
    test("build with the flag", () => {
      expect(blocks("./singularity build", true)).toBe(false);
    });

    test("push with the flag and a pipe", () => {
      expect(blocks(`./singularity push -m "x" 2>&1 | tail -50`, true)).toBe(
        false,
      );
    });
  });

  describe("shell-level detach is not backgrounding", () => {
    test("trailing & in the foreground", () => {
      expect(blocks("./singularity build &")).toBe(true);
    });

    test("nohup", () => {
      expect(blocks("nohup ./singularity build")).toBe(true);
    });

    test("trailing & even WITH run_in_background, because it fakes completion", () => {
      expect(blocks("./singularity build &", true)).toBe(true);
    });

    test("2>&1 is a redirection, not a detach", () => {
      expect(blocks("./singularity build 2>&1", true)).toBe(false);
    });
  });

  describe("short commands stay allowed", () => {
    test("check --list", () => {
      expect(blocks("./singularity check --list")).toBe(false);
    });

    test("--help", () => {
      expect(blocks("./singularity build --help")).toBe(false);
    });

    test("an unrelated command", () => {
      expect(blocks("git status")).toBe(false);
    });

    test("a different binary named similarly", () => {
      expect(blocks("echo ./singularity build")).toBe(false);
    });
  });
});
