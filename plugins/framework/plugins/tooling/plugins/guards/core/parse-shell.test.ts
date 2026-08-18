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

describe("heredoc bodies are data, not commands", () => {
  const S = "./singularity";

  describe("a document being written is not a script", () => {
    test("markdown inline code in the body mints no call", () => {
      const cmd = [
        "cat > research/x.md <<'EOF'",
        "## Verification",
        "",
        "- `" + S + " build --composition sonata` from an agent worktree",
        "- `" + S + " build` with no flag is byte-equivalent",
        "EOF",
      ].join("\n");
      expect(names(cmd)).toEqual(["cat"]);
    });

    test("a fenced code block in the body mints no call", () => {
      const cmd = [
        "cat > doc.md <<'EOF'",
        "```bash",
        S + " build && git push",
        "```",
        "EOF",
      ].join("\n");
      expect(names(cmd)).toEqual(["cat"]);
    });

    test("the owning call keeps its redirection and loses the operator", () => {
      const parsed = parseShell("cat > f <<'EOF'\nbody\nEOF");
      expect(parsed.calls).toHaveLength(1);
      expect(parsed.calls[0]!.args).toEqual([]);
      expect(parsed.calls[0]!.redirections).toEqual([{ op: ">", target: "f" }]);
    });

    test("code holds neither the body nor the operator", () => {
      const { code } = parseShell("cat > f <<'EOF'\nbody\nEOF");
      expect(code).not.toContain("body");
      expect(code).not.toContain("<<");
      expect(code).toContain("cat > f");
    });

    test("<<- strips tabs from body and terminator alike", () => {
      expect(names("cat <<-EOF\n\tbody\n\tEOF\ngit push")).toEqual([
        "cat",
        "git",
      ]);
    });

    test("two heredocs on one line consume their bodies in order", () => {
      expect(names("cat <<'A' <<'B'\nfirst\nA\nsecond\nB\necho done")).toEqual([
        "cat",
        "echo",
      ]);
    });

    test("an unterminated heredoc runs to the end of the input", () => {
      expect(names("cat <<'EOF'\ngit push")).toEqual(["cat"]);
    });

    test("an unbalanced quote in the body does not leak past the terminator", () => {
      expect(names("cat <<'EOF'\nit's (unbalanced\nEOF\ngit push")).toEqual([
        "cat",
        "git",
      ]);
    });

    test("a backslash-escaped delimiter is quoted, so the body is inert", () => {
      expect(names("cat <<\\EOF\n$(git push)\nEOF")).toEqual(["cat"]);
    });
  });

  describe("nothing real is hidden by it", () => {
    const message = (body: string) =>
      [S + " push -m \"$(cat <<'EOF'", body, "EOF", ')"'].join("\n");

    test("a commit message body is stripped, the push is still seen", () => {
      const cmd = message("fix(x): a thing\n\nRan `" + S + " build` first");
      expect(names(cmd)).toEqual(["singularity", "cat"]);
    });

    test("… even when the message body holds an unpaired quote", () => {
      // The `"` desyncs splitOnOperators, so without a substitution-aware
      // pre-pass the remaining body lines split into calls at depth 0.
      const cmd = message(
        'He said "hi and ran `' + S + " build` then\nnext $(git push) here",
      );
      expect(names(cmd)).toEqual(["singularity", "cat"]);
    });

    test("an interpreter executes its body whatever the delimiter quoting", () => {
      expect(names("bash <<'EOF'\ngit push\nEOF")).toEqual(["bash", "git"]);
    });

    test("a wrapped interpreter is still an interpreter", () => {
      expect(names("nohup bash <<'EOF'\ngit push\nEOF")).toEqual([
        "nohup",
        "bash",
        "git",
      ]);
    });

    test("a body piped into a shell is executed by it", () => {
      expect(names("cat <<'EOF' | bash\ngit push\nEOF")).toEqual([
        "cat",
        "bash",
        "git",
      ]);
    });

    test("a body piped into anything else stays data", () => {
      expect(names("cat <<'EOF' | tail -3\ngit push\nEOF")).toEqual([
        "cat",
        "tail",
      ]);
    });

    test("an unquoted delimiter expands its substitutions", () => {
      expect(names("cat <<EOF\nvalue $(git push)\nEOF")).toEqual([
        "cat",
        "git",
      ]);
    });

    test("… and an apostrophe in the body does not hide them", () => {
      expect(names("cat <<EOF\nit's $(git push)\nEOF")).toEqual(["cat", "git"]);
    });

    test("body calls run in the owning segment's cwd", () => {
      const calls = parseShell(
        "cd sub && bash <<'EOF'\nrm -rf .\nEOF",
        "/base",
      ).calls;
      expect(calls.find((c) => c.name === "rm")!.cwd).toBe("/base/sub");
    });

    test("parsing resumes after the terminator", () => {
      expect(names("python3 - <<'PY'\nprint(1)\nPY\ngit push")).toEqual([
        "python3",
        "git",
      ]);
    });
  });

  describe("what must not be read as a heredoc", () => {
    test("<<< is a here-string, and eats no following line", () => {
      expect(names('rg foo <<< "$x"\ngit push')).toContain("git");
    });

    test("arithmetic with a variable operand is not a delimiter", () => {
      expect(names("n=$((1 << shift)); git push")).toContain("git");
    });

    test("arithmetic with a constant operand is not a delimiter", () => {
      expect(names("n=$((1 << 2)); git push")).toContain("git");
    });

    test("a comment mentioning <<EOF swallows nothing", () => {
      expect(names("# see <<EOF for details\ngit push")).toContain("git");
    });
  });

  describe("the guards that read the parse", () => {
    test("a doc write mentioning the push rule is allowed", () => {
      const cmd = [
        "cat > rules.md <<'EOF'",
        "Never run `git push` yourself.",
        "EOF",
      ].join("\n");
      expect(blocks(gitPushGuard, cmd)).toBe(false);
    });

    test("a doc write mentioning the rebase rule is allowed", () => {
      const cmd = [
        "cat > rules.md <<'EOF'",
        "Never run `git reset --hard origin/main`.",
        "EOF",
      ].join("\n");
      expect(blocks(gitResetMainGuard, cmd)).toBe(false);
    });

    test("but a real push inside a heredoc-fed shell is still blocked", () => {
      expect(blocks(gitPushGuard, "bash <<'EOF'\ngit push\nEOF")).toBe(true);
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
