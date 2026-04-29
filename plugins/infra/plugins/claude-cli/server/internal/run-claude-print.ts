const CLAUDE_BIN = process.env.SINGULARITY_CLAUDE_BIN ?? "/Users/admin/.local/bin/claude";

const MODEL_IDS: Record<ClaudePrintModel, string> = {
  haiku: "claude-haiku-4-5",
  sonnet: "claude-sonnet-4-6",
  opus: "claude-opus-4-7",
};

export type ClaudePrintModel = "haiku" | "sonnet" | "opus";

export interface RunClaudePrintInput {
  model: ClaudePrintModel;
  prompt: string;
  system?: string;
  timeoutMs?: number;
}

export class ClaudeCliError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ClaudeCliError";
  }
}

export async function runClaudePrint(input: RunClaudePrintInput): Promise<string> {
  const timeoutMs = input.timeoutMs ?? 15_000;
  // `--tools ""` disables every tool so the model can't go off and plan/edit;
  // `--system-prompt` replaces (not appends) the default system prompt so the
  // project's CLAUDE.md context doesn't leak in and bias output away from the
  // requested format; `--no-session-persistence` avoids polluting the user's
  // resume list with throwaway one-shot calls.
  const args = [
    "--print",
    "--model",
    MODEL_IDS[input.model],
    "--tools",
    "",
    "--no-session-persistence",
  ];
  if (input.system) args.push("--system-prompt", input.system);

  // Run outside the worktree so claude doesn't auto-discover project CLAUDE.md
  // files even with --system-prompt set (defensive — the system prompt
  // replacement should already cover this).
  const proc = Bun.spawn([CLAUDE_BIN, ...args], {
    cwd: "/tmp",
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
  });
  proc.stdin.write(input.prompt);
  await proc.stdin.end();

  const timer = setTimeout(() => proc.kill(), timeoutMs);
  try {
    const [stdout, stderr, exit] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
    if (exit !== 0) {
      throw new ClaudeCliError(
        `claude --print exited ${exit}: ${stderr.trim() || "<no stderr>"}`,
      );
    }
    return stdout;
  } finally {
    clearTimeout(timer);
  }
}
