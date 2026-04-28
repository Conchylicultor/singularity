import { z } from "zod";
import { db } from "@server/db/client";
import { Mcp } from "@plugins/infra/plugins/mcp/server";
import { readConversationTurns } from "@plugins/conversations/server";
import { getConversation } from "@plugins/tasks-core/server";
import { _conversationSummaries } from "./tables";
import { conversationSummariesResource } from "./resources";
import { PhaseSchema } from "../../shared/resources";

export const SUMMARY_MODEL = "claude-sonnet-4-6";

function newSummaryId(): string {
  return `summary-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

Mcp.registerTool({
  name: "submit_conversation_summary",
  description: `Submit a structured progress summary of the target conversation.
Call EXACTLY ONCE per summarization run, then exit.

Phase semantics (pick the one that best describes what's happening RIGHT NOW
in the target conversation; status enums like working/blocked/done are
captured separately — this is about *what kind of activity*):
- "clarification_needed": waiting on the user (or another agent) to clarify
  intent, requirements, or pick between options before progress can resume.
- "design_review": a design / plan / proposal has been put forward and is
  awaiting review or sign-off.
- "implementation_review": code changes have been made and are awaiting
  review (correctness, style, scope) before merging or moving on.
- "investigating": actively exploring the codebase, reproducing a bug, or
  root-causing without a fixed plan yet.
- "executing": actively writing code or making changes against an agreed
  plan.
- "other": none of the above fits. You MUST then describe what's happening
  in \`phaseDetail\`.

Use the MCP tool directly — do NOT invoke it via Bash, curl, or HTTP.`,
  inputSchema: {
    conversationId: z
      .string()
      .min(1)
      .describe(
        "ID of the conversation being summarized. Use the id given in the prompt.",
      ),
    phase: PhaseSchema.describe(
      "Semantic phase. Use 'other' as escape hatch when nothing else fits.",
    ),
    phaseDetail: z
      .string()
      .max(500)
      .optional()
      .describe(
        "Free-form detail. Required when phase='other'; optional otherwise — use to refine the chosen phase if helpful.",
      ),
    flags: z
      .string()
      .max(2000)
      .optional()
      .describe(
        "Anything notable to flag — risks, blockers, surprises, scope creep, things the user should know about. Omit if nothing to flag.",
      ),
    nextAction: z
      .string()
      .min(1)
      .max(1000)
      .describe(
        "Concrete next step the user (or another agent) should take to move this conversation forward.",
      ),
    notes: z
      .string()
      .max(2000)
      .optional()
      .describe("Catch-all for anything else worth recording."),
  },
  async handler({ conversationId, phase, phaseDetail, flags, nextAction, notes }) {
    const conv = await getConversation(conversationId);
    if (!conv) {
      throw new Error(
        `No conversation with id "${conversationId}". Use the conversationId from the prompt.`,
      );
    }
    if (phase === "other" && (!phaseDetail || phaseDetail.trim() === "")) {
      throw new Error(
        "phaseDetail is required when phase is 'other'. Describe what's happening.",
      );
    }

    // Re-read turn count at the moment the summary is finalised — gives a
    // truthful "this is what we summarised" baseline for stale detection.
    const turns = await readConversationTurns(conversationId);

    await db.insert(_conversationSummaries).values({
      id: newSummaryId(),
      conversationId,
      model: SUMMARY_MODEL,
      turnCountAtGeneration: turns.length,
      phase,
      phaseDetail: phaseDetail ?? null,
      flags: flags ?? null,
      nextAction,
      notes: notes ?? null,
    });
    conversationSummariesResource.notify();

    return {
      content: [{ type: "text", text: JSON.stringify({ ok: true }) }],
    };
  },
});
