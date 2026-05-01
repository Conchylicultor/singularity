import { recordClaudeCliCall } from "./record-call";

const CLAUDE_BIN =
  process.env.SINGULARITY_CLAUDE_BIN ??
  (() => {
    const { existsSync } = require("node:fs") as typeof import("node:fs");
    const { homedir } = require("node:os") as typeof import("node:os");
    const fromPath = Bun.which("claude");
    if (fromPath) return fromPath;
    for (const p of [`${homedir()}/.local/bin/claude`, "/opt/homebrew/bin/claude", "/usr/local/bin/claude"]) {
      if (existsSync(p)) return p;
    }
    return "claude";
  })();

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
  // Identifies the caller for the debug call log. Required so every entry in
  // the pane has a meaningful "what launched this" label.
  source: {
    name: string;
    context?: Record<string, unknown>;
  };
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

  const startedAt = performance.now();
  let output: string | undefined;
  let caughtError: Error | undefined;
  try {
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
      output = stdout;
      return stdout;
    } finally {
      clearTimeout(timer);
    }
  } catch (err) {
    caughtError = err instanceof Error ? err : new Error(String(err));
    throw err;
  } finally {
    const durationMs = Math.round(performance.now() - startedAt);
    void recordClaudeCliCall({
      model: input.model,
      sourceName: input.source.name,
      sourceContext: input.source.context ?? null,
      prompt: input.prompt,
      system: input.system ?? null,
      output: output ?? null,
      error: caughtError ? caughtError.message : null,
      durationMs,
    });
  }
}
