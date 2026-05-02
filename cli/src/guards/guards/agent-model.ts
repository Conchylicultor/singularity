import type { AgentInput, Guard } from "../types";

const MESSAGE =
  'Agent tool call is missing the required `model` parameter. Always pass model explicitly (e.g. model: "sonnet"). Default: Sonnet for all research/lookup/synthesis/reporting tasks. Only use Opus for load-bearing complex implementation tasks. See CLAUDE.md: "Subagents default to Sonnet."';

export const agentModelGuard: Guard<AgentInput> = {
  name: "agent-model",
  matcher: "Agent",
  check(input, ctx) {
    if (input.model) return ctx.allow();
    return ctx.deny(MESSAGE);
  },
};
