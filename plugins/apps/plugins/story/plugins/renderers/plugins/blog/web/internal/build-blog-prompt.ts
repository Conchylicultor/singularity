import { outlineToBullets } from "@plugins/apps/plugins/story/plugins/story-core/core";
import type { BlogUnit } from "./segment-blog";

/**
 * Assembles the model input for one blog unit. One clean code path serves
 * BOTH fresh whole-article generation AND (future) per-section iteration with
 * context — the caller folds in whatever context the scope needs via `ctx`:
 *
 * - `siblings` — surrounding generated units' output (coherence, no repetition).
 * - `prior` — this unit's previous output (revise-in-place).
 * - `instruction` — the human directive for this turn (revision feedback).
 *
 * The framing forbids inline styling / code fences so the stored content stays
 * SEMANTIC Markdown — theme/presentation (axis C) is then a render-time choice.
 */
export function buildBlogPrompt(
  unit: BlogUnit,
  ctx?: { instruction?: string; prior?: string; siblings?: string[] },
): string {
  let prompt =
    "Write a polished blog article in clean semantic Markdown from the outline below. " +
    "Each top-level item becomes a section with a `##` heading; nested items become " +
    "prose paragraphs or `###` sub-headings that elaborate the idea; a `---` line is a " +
    "thematic section break (emit it as `---`). Match the ideas faithfully and do not " +
    "invent unrelated content. Output ONLY raw Markdown — no inline HTML/styling, no " +
    "code fences around the whole document, no preamble or commentary.";

  prompt += "\n\nOutline:\n" + outlineToBullets(unit.nodes);

  if (ctx?.siblings?.length) {
    prompt +=
      "\n\nFor coherence, here is the surrounding generated content (do not repeat it):\n" +
      ctx.siblings.join("\n\n");
  }

  if (ctx?.prior) {
    prompt += "\n\nHere is the previous version of this content:\n" + ctx.prior;
  }

  if (ctx?.instruction) {
    prompt += "\n\nRevise according to this feedback: " + ctx.instruction;
  }

  return prompt;
}
