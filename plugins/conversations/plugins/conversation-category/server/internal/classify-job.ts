import { z } from "zod";
import { defineJob } from "@plugins/infra/plugins/jobs/server";
import { readConfig } from "@plugins/config/server";
import {
  readConversationTurns,
  type Turn,
} from "@plugins/conversations/server";
import { getConversation } from "@plugins/tasks-core/server";
import {
  ClaudeCliError,
  runClaudePrint,
} from "@plugins/infra/plugins/claude-cli/server";
import { conversationCategoryConfig } from "../../shared/config";
import { conversationCategory } from "./tables";
import { conversationCategoriesResource } from "./resource";
import { pickCategory } from "./pick-category";

// First few turns are enough signal — the conversation's intent is set by
// then and Haiku gets a small enough prompt to stay under the timeout.
const TRANSCRIPT_TURN_LIMIT = 6;
const HAIKU_TIMEOUT_MS = 12_000;

function buildSystemPrompt(categories: readonly string[]): string {
  const list = categories.map((c) => `- ${c}`).join("\n");
  return `You categorize software-engineering chat conversations into one of a fixed set of labels.

Reply with EXACTLY ONE of these labels, copied verbatim, on a single line, with no surrounding quotes, prose, punctuation, or explanation:

${list}

If none fit clearly, choose the closest. Output the label and nothing else.`;
}

function buildTranscriptDigest(turns: Turn[]): string {
  return turns
    .slice(0, TRANSCRIPT_TURN_LIMIT)
    .map((turn) => {
      const role = turn.role === "assistant" ? "ASSISTANT" : "USER";
      const text = turn.text.trim();
      return `### ${role}\n${text || "<empty>"}`;
    })
    .join("\n\n");
}

// Triggered globally on every `conversationTurnCompleted` event (see the
// onReady hook in this plugin's barrel) and direct-enqueued from the
// re-classify HTTP route. Idempotent: skips if a row exists with
// `source: "manual"` (user override wins over auto), and skips Haiku for
// rows already classified by Haiku unless `force: true`.
export const classifyConversationJob = defineJob({
  name: "conversation-category.classify",
  input: z.object({
    conversationId: z.string().optional(),
    force: z.boolean().optional(),
  }),
  event: z
    .object({
      conversationId: z.string(),
    })
    .passthrough(),
  maxAttempts: 2,
  run: async ({ input, event }) => {
    const conversationId = input.conversationId ?? event?.conversationId;
    if (!conversationId) {
      console.warn(
        "[conversation-category] classify fired with no conversationId; skipping",
      );
      return;
    }
    const force = input.force ?? false;

    const prior = await conversationCategory.get(conversationId);

    // Manual override always wins; never overwrite without an explicit force.
    if (prior?.source === "manual" && !force) return;
    // Already classified by Haiku — only redo on explicit force.
    if (prior?.source === "haiku" && !force) return;

    const conversation = await getConversation(conversationId);
    if (!conversation) {
      // The conversation row may have been deleted between event emit and
      // job dispatch — nothing to classify.
      return;
    }

    const turns = await readConversationTurns(conversationId);
    if (turns.length === 0) {
      // Transcript not yet on disk (rare race after very-first turn); leave
      // unclassified — the next turn-completed event will retry.
      return;
    }

    const { autoClassify, categories } = await readConfig(conversationCategoryConfig);
    if (!autoClassify) return;
    if (categories.length === 0) return;

    let raw: string;
    try {
      raw = await runClaudePrint({
        model: "haiku",
        system: buildSystemPrompt(categories),
        prompt: buildTranscriptDigest(turns),
        timeoutMs: HAIKU_TIMEOUT_MS,
        source: {
          name: "conversation-category",
          context: { conversationId },
        },
      });
    } catch (err) {
      if (err instanceof ClaudeCliError) {
        console.warn(
          `[conversation-category] Haiku call failed for ${conversationId}: ${err.message}`,
        );
        return;
      }
      throw err;
    }

    const picked = pickCategory(raw, categories);

    await conversationCategory.upsert(conversationId, {
      category: picked,
      source: "haiku",
    });

    conversationCategoriesResource.notify();
  },
});
