import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@server/db/client";
import { defineJob } from "@plugins/infra/plugins/jobs/server";
import {
  readConversationTurns,
  type Turn,
} from "@plugins/conversations/server";
import { getConversation } from "@plugins/tasks-core/server";
import {
  ClaudeCliError,
  runClaudePrint,
} from "@plugins/infra/plugins/claude-cli/server";
import { PHASE_ORDER, type ConversationPhase } from "../../shared/schemas";
import { _conversationProgress } from "./tables";
import { conversationProgressResource } from "./resource";

const TRANSCRIPT_TURN_LIMIT = 6;
const HAIKU_TIMEOUT_MS = 12_000;

const SYSTEM_PROMPT = `You determine the current phase of a software engineering conversation between a user and an AI coding assistant.

Reply with EXACTLY ONE of these phases, copied verbatim, on a single line — no quotes, no prose:

research
plan
implementation
pushed

Guidelines:
- "research": Exploring code, reading files, asking questions. No concrete plan or code written yet.
- "plan": A design doc or plan has been written (e.g. a research/*.md file). Implementation not started.
- "implementation": Code has been written, edited, or bugs fixed. Agent is actively building.
- "pushed": Changes pushed to the repository (e.g. ./singularity push completed successfully).`;

function buildTranscriptDigest(turns: Turn[]): string {
  return turns
    .slice(0, TRANSCRIPT_TURN_LIMIT)
    .map((turn) => {
      const role = turn.role === "assistant" ? "ASSISTANT" : "USER";
      return `### ${role}\n${turn.text.trim() || "<empty>"}`;
    })
    .join("\n\n");
}

function parsePhase(raw: string): ConversationPhase {
  const normalized = raw.trim().toLowerCase();
  return PHASE_ORDER.find((p) => normalized === p) ?? "research";
}

// Triggered globally on every `conversationTurnCompleted` event. Idempotent
// on (conversationId, messageId): same messageId = same turn, already processed.
// Phases are monotonically increasing — Haiku can never regress the stored phase.
export const classifyProgressJob = defineJob({
  name: "conversation-progress.classify",
  input: z.object({}).passthrough(),
  event: z
    .object({
      conversationId: z.string(),
      messageId: z.string().nullable().optional(),
    })
    .passthrough(),
  maxAttempts: 2,
  run: async ({ event }) => {
    const conversationId = event?.conversationId;
    if (!conversationId) return;

    const messageId = event?.messageId ?? null;
    if (!messageId) return;

    const existing = await db
      .select({
        phase: _conversationProgress.phase,
        messageId: _conversationProgress.messageId,
      })
      .from(_conversationProgress)
      .where(eq(_conversationProgress.conversationId, conversationId))
      .limit(1);
    const prior = existing[0];

    if (prior?.messageId === messageId) return;

    const conversation = await getConversation(conversationId);
    if (!conversation) return;

    const turns = await readConversationTurns(conversationId);
    if (turns.length === 0) return;

    let raw: string;
    try {
      raw = await runClaudePrint({
        model: "haiku",
        system: SYSTEM_PROMPT,
        prompt: buildTranscriptDigest(turns),
        timeoutMs: HAIKU_TIMEOUT_MS,
        source: { name: "conversation-progress", context: { conversationId } },
      });
    } catch (err) {
      if (err instanceof ClaudeCliError) {
        console.warn(
          `[conversation-progress] Haiku call failed for ${conversationId}: ${err.message}`,
        );
        return;
      }
      throw err;
    }

    const newPhase = parsePhase(raw);

    // Enforce monotonicity: only advance, never regress.
    const currentIndex = PHASE_ORDER.indexOf(
      (prior?.phase as ConversationPhase) ?? "research",
    );
    const newIndex = PHASE_ORDER.indexOf(newPhase);
    const finalPhase =
      prior && newIndex < currentIndex ? (prior.phase as ConversationPhase) : newPhase;

    await db
      .insert(_conversationProgress)
      .values({
        conversationId,
        phase: finalPhase,
        messageId,
        source: "haiku",
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: _conversationProgress.conversationId,
        set: {
          phase: finalPhase,
          messageId,
          source: "haiku",
          updatedAt: new Date(),
        },
      });

    conversationProgressResource.notify();
  },
});
