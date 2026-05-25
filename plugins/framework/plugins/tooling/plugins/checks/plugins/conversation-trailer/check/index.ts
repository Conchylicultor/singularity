type CheckResult = { ok: true } | { ok: false; message: string; hint?: string };
type Check = { id: string; description: string; run(): Promise<CheckResult> };

const STOP_MESSAGE =
  "STOP. Do not attempt to fix, commit, or push. Report this failure to the user verbatim and wait for explicit instructions before starting a debugging session.";

async function run(
  cmd: string[],
): Promise<{ stdout: string; exitCode: number }> {
  const proc = Bun.spawn(cmd, { stdout: "pipe", stderr: "pipe" });
  const stdout = await new Response(proc.stdout).text();
  const exitCode = await proc.exited;
  return { stdout: stdout.trim(), exitCode };
}

async function currentBranch(): Promise<string> {
  const { stdout } = await run(["git", "rev-parse", "--abbrev-ref", "HEAD"]);
  return stdout;
}

async function commitsAheadOfMain(): Promise<{ sha: string; trailer: string }[]> {
  const { stdout, exitCode } = await run([
    "git",
    "log",
    "main..HEAD",
    "--format=%H%x00%(trailers:key=Singularity-Conversation,valueonly,separator=%x2C)",
  ]);
  if (exitCode !== 0 || !stdout) return [];
  return stdout.split("\n").map((line) => {
    const parts = line.split("\0");
    return { sha: parts[0]!, trailer: (parts[1] ?? "").trim() };
  });
}

const check: Check = {
  id: "conversation-trailer",
  description:
    "SINGULARITY_CONVERSATION_ID is set and every commit ahead of main carries the Singularity-Conversation trailer",
  async run() {
    const branch = await currentBranch();
    if (branch === "main") return { ok: true };

    const envId = process.env.SINGULARITY_CONVERSATION_ID;
    if (!envId) {
      return {
        ok: false,
        message:
          "SINGULARITY_CONVERSATION_ID is not set in this shell. The `./singularity push` amend would strip attribution, orphaning the push from its task.",
        hint: STOP_MESSAGE,
      };
    }

    const commits = await commitsAheadOfMain();
    if (commits.length === 0) return { ok: true };

    const missing = commits.filter((c) => !c.trailer);
    if (missing.length > 0) {
      const list = missing.map((c) => `  ${c.sha.slice(0, 12)}`).join("\n");
      return {
        ok: false,
        message:
          `${missing.length} commit(s) ahead of main lack a Singularity-Conversation trailer:\n${list}\n` +
          `The prepare-commit-msg hook did not fire for these commits (env missing at commit time, or committed from outside the pane). ` +
          `Without the trailer, push-watcher cannot attribute the push and the task will stay 'attempted'.`,
        hint: STOP_MESSAGE,
      };
    }

    const mismatched = commits.filter(
      (c) => c.trailer && !c.trailer.split(",").includes(envId),
    );
    if (mismatched.length > 0) {
      const list = mismatched
        .map((c) => `  ${c.sha.slice(0, 12)}  trailer=${c.trailer}`)
        .join("\n");
      return {
        ok: false,
        message:
          `${mismatched.length} commit(s) carry a Singularity-Conversation trailer that does not match this pane (SINGULARITY_CONVERSATION_ID=${envId}):\n${list}`,
        hint:
          "If the commit was created by another conversation sharing this worktree, " +
          "you can safely uncommit (git reset HEAD~1) while keeping the changes, " +
          "then run ./singularity push again — the new commit will carry the correct trailer for this conversation. " +
          STOP_MESSAGE,
      };
    }

    return { ok: true };
  },
};

export default check;
