import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { recheckClaudeCode } from "../core";
import { handleRecheck } from "./internal/handle-recheck";
import { claudeCodeStatusServed } from "./internal/status";

export {
  assertClaudeCodeReady,
  checkClaudeCode,
  ClaudeCodeUnavailableError,
  noteClaudeCodeFailure,
  onClaudeCodeProbed,
  onClaudeCodeReady,
  requireClaudeBin,
} from "./internal/status";

export default {
  description:
    "Claude Code availability: probes whether the user's Claude Code CLI is installed and signed in (`claude --version` + `claude auth status --json`, under the agent panes' host env), serves it as the claude-code-status push resource and POST /api/claude-code/recheck, and gives every launch path assertClaudeCodeReady() and requireClaudeBin() — so an agent that cannot run is refused up front with the fix, never started as `command not found`. onClaudeCodeProbed hands every fresh answer to work keyed off the installed CLI's version.",
  httpRoutes: {
    [recheckClaudeCode.route]: handleRecheck,
  },
  contributions: [...claudeCodeStatusServed.declare],
} satisfies ServerPluginDefinition;
