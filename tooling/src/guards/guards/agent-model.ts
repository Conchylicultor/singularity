import { defineGuard } from "../define-guard";
import type { AgentInput } from "../types";

export const agentModelGuard = defineGuard<AgentInput>({
  name: "agent-model",
  matcher: "Agent",
  check(input) {
    if (input.model) return null;
    return {
      blocked: "Agent tool call is missing the required `model` parameter.",
      hint: 'Always pass model explicitly (e.g. model: "sonnet"). Default: Sonnet for all research/lookup/synthesis/reporting tasks. Only use Opus for load-bearing complex implementation tasks. See CLAUDE.md: "Subagents default to Sonnet."',
      skipEpilogue: true,
    };
  },
});
