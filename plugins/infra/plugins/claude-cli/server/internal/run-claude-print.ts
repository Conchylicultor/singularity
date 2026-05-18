import { reportServerError } from "@plugins/framework/plugins/server-core/core";
import { CLAUDE as CLAUDE_BIN } from "@plugins/infra/plugins/paths/server";
import { recordClaudeCliCall } from "./record-call";

// Strip inherited Claude Code env vars so one-shot `claude --print` calls
// don't inherit the parent session's settings (e.g. CLAUDE_CODE_EXTRA_BODY
// with adaptive thinking, which Haiku doesn't support).
const cleanEnv: Record<string, string> = {};
for (const [k, v] of Object.entries(process.env)) {
  if (v !== undefined && !k.startsWith("CLAUDE_CODE_")) cleanEnv[k] = v;
}

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
      stdin: Buffer.from(input.prompt),
      stdout: "pipe",
      stderr: "pipe",
      env: cleanEnv,
    });

    const timer = setTimeout(() => proc.kill(), timeoutMs);
    try {
      const [stdout, stderr, exit] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
        proc.exited,
      ]);
      if (exit !== 0) {
        const detail = stderr.trim() || stdout.trim() || "<no output>";
        throw new ClaudeCliError(
          `claude --print exited ${exit}: ${detail}`,
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
    if (caughtError) {
      reportServerError({
        message: `[claude-cli] ${input.source.name}: ${caughtError.message}`,
        stack: caughtError.stack,
        errorType: caughtError.name,
      });
    }
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
