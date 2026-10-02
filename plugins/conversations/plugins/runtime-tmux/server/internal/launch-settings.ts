import { signalDirForCommands } from "./tmux-hooks";

// The one `--settings` object a launch hands Claude Code. Two contributors share
// it: the thinking mode (`{"ultracode":true}`, from effort-provider) and the
// hooks below. One object, one flag — two `--settings` flags would leave which
// one wins to the CLI.
//
// The hooks are the question's push signal. Nothing on disk says an
// AskUserQuestion menu is up: the CLI buffers the assistant message and writes
// its tool_use only once the tool resolves, and the sessions file reads as an
// ordinary wait (or `busy`, depending on the version). So the agent itself
// touches the conversation's signal file the moment the tool starts
// (`PreToolUse`, before the menu is drawn) and again when it resolves either way
// (`PostToolUse` / `PostToolUseFailure`) or a prompt is submitted
// (`UserPromptSubmit`). The touch only wakes the reconciler; the pane itself
// (pane-menu.ts) still decides whether a menu is on screen.

const QUESTION_TOOL = "AskUserQuestion";

/**
 * The hooks settings fragment for a pane whose signal file lives in `dir`.
 * `$SINGULARITY_CONVERSATION_ID` is expanded by the shell Claude Code runs the
 * hook in — the pane delivers it (see agent-session-env.ts), so the command is
 * the same string for every conversation.
 */
export function signalHookSettings(dir: string): Record<string, unknown> {
  const hook = {
    type: "command",
    command: `touch "${signalDirForCommands(dir)}/$SINGULARITY_CONVERSATION_ID"`,
  };
  const onQuestion = [{ matcher: QUESTION_TOOL, hooks: [hook] }];
  return {
    hooks: {
      PreToolUse: onQuestion,
      PostToolUse: onQuestion,
      PostToolUseFailure: onQuestion,
      UserPromptSubmit: [{ hooks: [hook] }],
    },
  };
}

/**
 * Merge the launch's settings fragments into one object. A key two fragments
 * both set throws: neither may silently overwrite the other.
 */
export function mergeLaunchSettings(
  ...fragments: Array<Record<string, unknown> | undefined>
): Record<string, unknown> {
  const merged: Record<string, unknown> = {};
  for (const fragment of fragments) {
    if (!fragment) continue;
    for (const [key, value] of Object.entries(fragment)) {
      if (key in merged) {
        throw new Error(
          `launch settings: two fragments both set "${key}" — merge them explicitly`,
        );
      }
      merged[key] = value;
    }
  }
  return merged;
}

/**
 * `--settings '<json>'`, single-quoted for the pane's shell. JSON never needs a
 * single quote, but a value could carry one; that would end the quoting early,
 * so it throws rather than escaping.
 */
export function settingsFlag(settings: Record<string, unknown>): string {
  const json = JSON.stringify(settings);
  if (json.includes("'")) {
    throw new Error(
      `launch settings contain a single quote and cannot be single-quoted: ${json}`,
    );
  }
  return `--settings '${json}'`;
}
