import { z } from "zod";
import { MdMenuBook } from "react-icons/md";
import { defineAnnotationBlock } from "@plugins/page/plugins/annotations/core";

/**
 * An instructions card is a void container whose ONE field is not appearance
 * but reach: `global` says its body is handed to every agent conversation at
 * its start, wherever that conversation works. Absent (or `false`) means the
 * card reaches only agents reading or writing under the page it sits on.
 *
 * Still no `text`: the card's content is its children, like every annotation.
 */
export const instructionsDataSchema = z.object({
  global: z.boolean().optional(),
});
export type InstructionsData = z.infer<typeof instructionsDataSchema>;

/**
 * The attributes `<instructions>` accepts. `id` is not among them: the parse
 * lifts it off as the node's `ref` before these are read.
 */
const INSTRUCTIONS_ATTRS = new Set(["global"]);

/**
 * The human's standing instructions to agents, as an inline card — the CLAUDE.md
 * of a part of the wiki. An agent receives it with any read under the page the
 * card sits on (and every page below), and cannot write there until it has
 * received the current version; a `global` card reaches every conversation at
 * its start. The delivery lives in this plugin's server half
 * (`instructionsInScope`, `globalInstructions`, `pendingDeliveries`).
 *
 * The pair of parties is the same as `/human`'s, and for the same reason:
 * addressed to an agent, and the human's words, so an agent reads this card and
 * never writes it — `author: "human"` closes it even inside an agent's own
 * `<agent-inline>` card or `<agent-page>`.
 */
export const instructionsBlock = defineAnnotationBlock({
  type: "instructions",
  schema: instructionsDataSchema,
  label: "Instructions",
  icon: MdMenuBook,
  audience: "agent",
  author: "human",
  // `/instructions` itself is the label. These are the other words a person
  // types for the same thing; `human-notes` gave up `instructions`, `rules`,
  // `guidance` and `conventions` so the palette offers one card for them.
  aliases: ["rules", "guidance", "conventions"],
  empty: () => ({}),
  // `<instructions id="…" global="true">…</instructions>`. `identified` for the
  // reason every agent-facing card carries its row id: an agent editing around
  // the card must echo it back exactly, and the applier pins it by id.
  //
  // `global` is a plain attribute, emitted only when true, rather than the
  // derived projection's JSON `data` blob: an agent reading the page should see
  // at a glance that a card reaches every conversation. The agent cannot change
  // it — the card is the human's (`author`), so a write that touches the row is
  // refused by the write policy whatever the attribute says.
  markdown: {
    tag: {
      name: "instructions",
      body: "children",
      identified: true,
      attrs: (data) => ({ global: data.global === true ? "true" : undefined }),
      parseAttrs: (attrs) => {
        for (const name of Object.keys(attrs)) {
          if (!INSTRUCTIONS_ATTRS.has(name)) {
            throw new Error(
              `markdown: <instructions> takes only \`id\` and \`global\`, but was given \`${name}\`.`,
            );
          }
        }
        const global = attrs.global;
        if (global === undefined) return {};
        if (global !== "true" && global !== "false") {
          throw new Error(
            `markdown: <instructions global="${global}"> — \`global\` is "true" or absent.`,
          );
        }
        return global === "true" ? { global: true } : {};
      },
    },
  },
});
