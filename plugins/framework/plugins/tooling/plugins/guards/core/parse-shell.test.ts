import { describe, expect, test } from "bun:test";
import { createContext } from "./context";
import { gitPushGuard } from "./guards/git-push";
import { gitResetMainGuard } from "./guards/git-reset-main";
import { parseShell } from "./parse-shell";
import type { Verdict } from "./types";

const names = (cmd: string) => parseShell(cmd).calls.map((c) => c.name);
const blocks = (
  guard: { check: (i: never, c: never) => unknown },
  command: string,
) =>
  (guard.check({ command } as never, createContext("/tmp") as never) as Verdict)
    .kind === "deny";

describe("parseShell reaches inside block structure", () => {
  describe("loop bodies", () => {
    test("until … do <cmd> done exposes the body command", () => {
      expect(names("until false; do git push; done")).toEqual(["false", "git"]);
    });

    test("while … do <cmd> done exposes the body command", () => {
      expect(names("while kill -0 62088; do sleep 60; done")).toEqual([
        "kill",
        "sleep",
      ]);
    });

    test("for binds a word list and contributes no call of its own", () => {
      expect(names("for f in a b; do rm $f; done")).toEqual(["rm"]);
    });

    test("if/then/fi exposes the branch command", () => {
      expect(names("if [ -f x ]; then git push; fi")).toEqual(["[", "git"]);
    });
  });

  describe("substitutions and groups", () => {
    test("$( … ) contributes its inner command", () => {
      expect(names("echo $(git push)")).toEqual(["echo", "git"]);
    });

    test("backticks contribute their inner command", () => {
      expect(names("echo `git push`")).toEqual(["echo", "git"]);
    });

    test("a ( … ) group contributes its inner command", () => {
      expect(names("(git push)")).toEqual(["git"]);
    });

    test("single quotes are not expanded, so nothing is extracted", () => {
      expect(names("echo 'not a $(substitution)'")).toEqual(["echo"]);
    });

    test("an operator inside $( … ) does not split the substitution", () => {
      expect(names("x=$(cd /tmp && pwd)")).toEqual(["cd", "pwd"]);
    });
  });

  describe("prefixes that hide the real command", () => {
    test("VAR=value prefix is peeled", () => {
      expect(names("FOO=1 git push")).toEqual(["git"]);
    });

    test("a leading ! is peeled", () => {
      expect(names("! pgrep -f x")).toEqual(["pgrep"]);
    });
  });

  describe("wrappers surface the command they wrap", () => {
    test("nohup", () => {
      expect(names("nohup ./singularity build")).toEqual([
        "nohup",
        "singularity",
      ]);
    });

    test("env with assignments", () => {
      expect(names("env FOO=1 git push")).toEqual(["env", "git"]);
    });

    test("timeout with its duration", () => {
      expect(names("timeout 30 git push")).toEqual(["timeout", "git"]);
    });

    test("nice with a flag and its value", () => {
      expect(names("nice -n 5 git push")).toEqual(["nice", "git"]);
    });

    test("xargs", () => {
      expect(names("ls | xargs rm -rf")).toEqual(["ls", "xargs", "rm"]);
    });

    test("stacked wrappers peel one layer at a time", () => {
      expect(names("nohup sudo git push")).toEqual(["nohup", "sudo", "git"]);
    });
  });

  describe("redirections are not commands", () => {
    test("2>&1 does not mint a call named 1", () => {
      expect(names("./singularity build 2>&1 | tail -15")).toEqual([
        "singularity",
        "tail",
      ]);
    });
  });

  describe("cwd folding", () => {
    test("cd moves the calls that follow it", () => {
      const calls = parseShell("cd /tmp && rm -rf x", "/base").calls;
      expect(calls[1]!.cwd).toBe("/tmp");
    });

    test("a cd inside a subshell does not move the parent", () => {
      const calls = parseShell(
        "cd sub && (cd other && pwd) && pwd",
        "/base",
      ).calls;
      expect(calls.at(-1)!.cwd).toBe("/base/sub");
    });
  });
});

describe("existing guards now see inside loops and substitutions", () => {
  test("git-push blocked inside an until loop", () => {
    expect(blocks(gitPushGuard, "until false; do git push; done")).toBe(true);
  });

  test("git-push blocked inside a command substitution", () => {
    expect(blocks(gitPushGuard, "echo $(git push origin main)")).toBe(true);
  });

  test("git-push blocked inside a subshell", () => {
    expect(blocks(gitPushGuard, "(git push origin main)")).toBe(true);
  });

  test("git-reset-main blocked inside a loop body", () => {
    expect(
      blocks(
        gitResetMainGuard,
        "while true; do git reset --hard origin/main; done",
      ),
    ).toBe(true);
  });

  test("git-reset-main blocked behind a VAR= prefix", () => {
    expect(
      blocks(gitResetMainGuard, "GIT_DIR=.git git reset --hard origin/main"),
    ).toBe(true);
  });

  test("git-push blocked behind a nohup wrapper", () => {
    expect(blocks(gitPushGuard, "nohup git push origin main")).toBe(true);
  });

  test("git-push blocked behind env + timeout wrappers", () => {
    expect(blocks(gitPushGuard, "env GIT_TRACE=1 timeout 60 git push")).toBe(
      true,
    );
  });

  test("benign loops stay allowed", () => {
    expect(blocks(gitPushGuard, "until [ -f done ]; do sleep 5; done")).toBe(
      false,
    );
  });
});
