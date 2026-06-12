import { z } from "zod";
import { defineJob } from "@plugins/infra/plugins/jobs/server";
import { runClaudePrint, ClaudeCliError } from "@plugins/infra/plugins/claude-cli/server";
import { completeUnitGeneration, failUnitGeneration } from "./mutations";

// Strip a single leading ```lang fence and trailing ``` if the whole output is
// fenced. Renderers want semantic content (clean markdown / json), never a code
// block wrapper the model occasionally adds.
function stripCodeFences(text: string): string {
  const trimmed = text.trim();
  const match = trimmed.match(/^```[^\n]*\n([\s\S]*?)\n?```$/);
  return match?.[1] ?? trimmed;
}

export const storyGenerationGenerateJob = defineJob({
  name: "story-generation.generate",
  input: z.object({
    pageId: z.string(),
    kind: z.string(),
    unitId: z.string(),
    prompt: z.string(),
  }),
  event: z.never(),
  dedup: { key: (i) => `${i.pageId}:${i.kind}:${i.unitId}` },
  maxAttempts: 1,
  run: async ({ input }) => {
    try {
      let output = await runClaudePrint({
        tier: "sonnet",
        prompt: input.prompt,
        timeoutMs: 60_000,
        source: {
          name: "story-generation.generate",
          context: { pageId: input.pageId, kind: input.kind, unitId: input.unitId },
        },
      });
      output = stripCodeFences(output).trim();
      if (!output) {
        await failUnitGeneration({
          pageId: input.pageId,
          kind: input.kind,
          unitId: input.unitId,
          error: "Empty generation",
        });
        return;
      }
      await completeUnitGeneration({
        pageId: input.pageId,
        kind: input.kind,
        unitId: input.unitId,
        output,
      });
    } catch (err) {
      if (err instanceof ClaudeCliError) {
        await failUnitGeneration({
          pageId: input.pageId,
          kind: input.kind,
          unitId: input.unitId,
          error: err.message,
        });
        return;
      }
      throw err;
    }
  },
});
