import { z } from "zod";

/**
 * The name Claude Code gives the sub-agent launcher in a transcript's
 * `tool_use` block. The transcript renderer matches on it, and so does
 * anything that folds sub-agent launches out of the event stream.
 */
export const AGENT_TOOL_NAME = "Agent";

/**
 * The `input` of an Agent tool call, as Claude Code writes it. Parsed (not
 * cast) wherever it is read, so a transcript whose shape drifted fails where
 * it is read rather than rendering `undefined`.
 */
export const AgentInputSchema = z.object({
  prompt: z.string(),
  description: z.string().optional(),
  subagent_type: z.string().optional(),
  model: z.string().optional(),
  isolation: z.string().optional(),
  run_in_background: z.boolean().optional(),
});
export type AgentInput = z.infer<typeof AgentInputSchema>;

/** The agent type a launch without `subagent_type` runs as. */
export const DEFAULT_AGENT_TYPE = "general-purpose";
