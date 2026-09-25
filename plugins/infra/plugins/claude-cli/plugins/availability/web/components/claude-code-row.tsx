import { useEffect } from "react";
import { MdRefresh } from "react-icons/md";
import { IconButton } from "@plugins/primitives/plugins/icon-button/web";
import { fetchEndpoint } from "@plugins/infra/plugins/endpoints/web";
import {
  Steps,
  Step,
  StepCommand,
  StepNote,
} from "@plugins/primitives/plugins/setup-steps/web";
import {
  CLAUDE_CODE_FIX,
  claudeCodeProblem,
  recheckClaudeCode,
} from "../../core";
import { useClaudeCodeStatus } from "../internal/use-claude-code";

function recheck(): Promise<unknown> {
  return fetchEndpoint(recheckClaudeCode, {});
}

/** The row's trailing control: ask the machine again now. */
export function ClaudeCodeActions() {
  return <IconButton icon={MdRefresh} label="Check again" onClick={recheck} />;
}

/** The expanded row: what is wrong, and the commands that fix it. */
export function ClaudeCodeDetail() {
  const result = useClaudeCodeStatus();
  if (result.pending) return null;
  const s = result.data;
  switch (s.kind) {
    case "ready":
      return (
        <StepNote>
          Every agent runs on this Claude Code
          {s.authMethod ? ` (signed in with ${s.authMethod})` : ""}.
        </StepNote>
      );
    case "unreadable":
      return <StepNote>{claudeCodeProblem(s)}</StepNote>;
    case "missing":
      return (
        <Steps>
          <Step title="Install Claude Code" state="active">
            <StepNote>Looked in {s.searched.join(", ")}.</StepNote>
            <StepCommand
              text={CLAUDE_CODE_FIX.install}
              title="Copy install command"
            />
          </Step>
          <Step title="Sign in" state="active">
            <StepCommand
              text={CLAUDE_CODE_FIX.signIn}
              title="Copy sign-in command"
            />
            <StepNote>Then come back here; the app checks again.</StepNote>
          </Step>
        </Steps>
      );
    case "signed-out":
      return (
        <Steps>
          <Step title="Sign in to Claude Code" state="active">
            <StepCommand
              text={CLAUDE_CODE_FIX.signIn}
              title="Copy sign-in command"
            />
            <StepNote>Then come back here; the app checks again.</StepNote>
          </Step>
        </Steps>
      );
  }
}

/**
 * Checks again when the user comes back to the app while Claude Code is known
 * blocked. Installing or signing in happens in a terminal, which announces
 * nothing to this machine's watchers — returning to the window is the moment
 * the user expects the app to have noticed. An event, not polling: nothing
 * runs while the window stays focused or while Claude Code is fine.
 */
export function RecheckOnReturn() {
  const result = useClaudeCodeStatus();
  const blocked =
    !result.pending &&
    (result.data.kind === "missing" ||
      result.data.kind === "signed-out" ||
      result.data.kind === "unreadable");
  useEffect(() => {
    if (!blocked) return;
    const onFocus = () => {
      void recheck();
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [blocked]);
  return null;
}
