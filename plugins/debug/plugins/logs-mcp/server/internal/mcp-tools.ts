import { z } from "zod";
import { basename } from "path";
import { Mcp } from "@plugins/infra/plugins/mcp/server";
import { getConversation } from "@plugins/tasks-core/server";
import { listChannels, readChannelEntries } from "@plugins/debug/plugins/logs/server";

const DEFAULT_TAIL = 200;

export const readLogsTool = Mcp.tool({
  name: "read_logs",
  description: `Read browser/server debug log channels for a worktree (the non-SQL sibling of query_db, for logs emitted via clientLog() or Log.channel({persist:true})).
Logs persist to a per-worktree JSONL file and survive backend restarts.
Omit \`channel\` to list available channels. Default: the current conversation's worktree; pass \`worktree\` to target another (e.g. "singularity" for main). Returns up to \`tail\` newest entries (default ${DEFAULT_TAIL}).`,
  inputSchema: {
    channel: z
      .string()
      .optional()
      .describe("Log channel name. Omit to list available channels for the worktree."),
    worktree: z
      .string()
      .optional()
      .describe("Target worktree name. Defaults to the conversation's own worktree."),
    tail: z
      .number()
      .int()
      .positive()
      .optional()
      .describe(`Max newest entries to return (default ${DEFAULT_TAIL}).`),
  },
  async handler({ channel, worktree, tail }, { conversationId }) {
    let slug: string;
    if (worktree) {
      slug = worktree;
    } else {
      const conv = await getConversation(conversationId);
      if (!conv) throw new Error(`Unknown conversation "${conversationId}"`);
      slug = basename(conv.worktreePath);
    }

    if (!/^[a-zA-Z0-9_-]+$/.test(slug)) {
      throw new Error(`Unsafe worktree name: "${slug}"`);
    }

    if (!channel) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ worktree: slug, channels: listChannels(slug) }),
          },
        ],
      };
    }

    const entries = readChannelEntries(slug, channel, tail ?? DEFAULT_TAIL);
    if (entries === null) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              worktree: slug,
              channel,
              error: "no such channel",
              channels: listChannels(slug),
            }),
          },
        ],
      };
    }
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ worktree: slug, channel, entries }),
        },
      ],
    };
  },
});
