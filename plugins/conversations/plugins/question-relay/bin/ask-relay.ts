#!/usr/bin/env bun
// The AskUserQuestion relay: a Claude Code PreToolUse hook that holds the tool
// call while the web shows the question, then hands the web's answer back as
// `updatedInput` — so the agent gets a real tool result, not an interrupt.
// Launched by runtime-tmux's launch settings (core/hook.ts builds the entry).
//
// Exit contract with the CLI:
//   - answered → the allow JSON on stdout, exit 0 (no menu);
//   - released / abandoned / backend unreachable for 5 min → no output, exit 0
//     (the CLI draws its own menu);
//   - a refused request or a malformed input → stderr, exit 1 (a non-blocking
//     hook error: the menu is drawn). Never exit 2, which would BLOCK the tool.
//   - SIGTERM (Escape in the terminal) → POST abandon (bounded 2 s), exit 0.
import {
  abandonQuestion,
  parseHookInput,
  relayBaseUrl,
  RelayRefusedError,
  runRelay,
  type RelayHookInput,
} from "../shared/relay";

function fail(message: string): never {
  process.stderr.write(`[question-relay] ${message}\n`);
  process.exit(1);
}

const conversationId = process.env.SINGULARITY_CONVERSATION_ID;
const parentHost = process.env.SINGULARITY_PARENT_HOST;
if (!conversationId || !parentHost) {
  fail(
    "SINGULARITY_CONVERSATION_ID / SINGULARITY_PARENT_HOST are not set — not an app-launched agent pane",
  );
}

const chunks: Buffer[] = [];
for await (const chunk of process.stdin) chunks.push(chunk as Buffer);

let input: RelayHookInput;
try {
  input = parseHookInput(Buffer.concat(chunks).toString("utf8"));
} catch (err) {
  fail(`bad hook input: ${err instanceof Error ? err.message : String(err)}`);
}

const baseUrl = relayBaseUrl(parentHost);

// Escape in the terminal SIGTERMs the hook and fires no other hook (Phase 0
// finding 4), so this is the only moment the backend can learn the question is
// over. The reconciler's relay-pid check is the backstop when it does not land.
process.on("SIGTERM", () => {
  void abandonQuestion(baseUrl, conversationId, input.tool_use_id)
    .catch((err: unknown) => {
      process.stderr.write(
        `[question-relay] abandon failed: ${err instanceof Error ? err.message : String(err)}\n`,
      );
    })
    .finally(() => process.exit(0));
});

try {
  const outcome = await runRelay({
    baseUrl,
    conversationId,
    input,
    pid: process.pid,
    onRetry: (message) =>
      process.stderr.write(
        `[question-relay] backend unreachable: ${message}\n`,
      ),
  });
  if (outcome.kind === "answered") process.stdout.write(`${outcome.output}\n`);
  process.exit(0);
} catch (err) {
  if (err instanceof RelayRefusedError) fail(err.message);
  throw err;
}
