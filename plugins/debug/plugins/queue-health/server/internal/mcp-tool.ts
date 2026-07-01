import { z } from "zod";
import { basename } from "path";
import { Mcp } from "@plugins/infra/plugins/mcp/server";
import { getConversation } from "@plugins/tasks/plugins/tasks-core/server";
import { QueueHealthSummarySchema } from "../../core";

export const queueHealthTool = Mcp.tool({
  name: "get_queue_health",
  description: `Attributed health of a worktree's graphile-worker job queue: which jobs dominate the ready backlog, which jobs are holding the shared worker slots the longest, and which jobs are terminally dead. Use to diagnose why the queue is backed up or why newly-enqueued work is not running.

The worker drains a single shared pool of \`concurrency\` slots (all jobs route through one \`jobs.run\` task; the real name lives in the payload). When \`backlog.lockedCount\` approaches \`concurrency\` the pool is saturated — new work waits behind whatever holds the slots.

Fields:
- \`concurrency\` — the shared slot-pool size (max jobs running at once).
- \`backlog\` — aggregate: \`readyCount\` (overdue, unlocked, retry-eligible jobs waiting), \`lockedCount\` (jobs currently running / holding a slot), \`oldestOverdueMs\` (age of the oldest ready job).
- \`byJobName\` — top-N breakdown of the ready backlog by jobName (\`readyCount\`, \`oldestOverdueMs\`): **who is filling the ready queue.**
- \`running\` — currently-locked jobs, longest-held slot first (\`jobName\`, \`jobId\`, \`lockedForMs\`, \`lockedBy\`): **who holds the slots.** A job locked for many minutes is why new work waits, even while \`lockedCount > 0\`.
- \`dead\` — terminally-failed jobs per jobName (\`deadCount\`, \`attempts\`/\`maxAttempts\`, \`lastError\`, \`sampleJobId\`): **the terminal failures** clogging the queue.

Default: reads the current conversation's own worktree. Pass \`worktree\` to target a different one (e.g. "att-1778089188-7uvf" or "singularity" for main).`,
  inputSchema: {
    worktree: z
      .string()
      .optional()
      .describe(
        "Target worktree name. Defaults to the conversation's own worktree.",
      ),
  },
  async handler({ worktree }, { conversationId }) {
    let worktreeName: string;
    if (worktree) {
      worktreeName = worktree;
    } else {
      const conv = await getConversation(conversationId);
      if (!conv) throw new Error(`Unknown conversation "${conversationId}"`);
      worktreeName = basename(conv.worktreePath);
    }

    if (!/^[a-zA-Z0-9_-]+$/.test(worktreeName)) {
      throw new Error(`Unsafe worktree name: "${worktreeName}"`);
    }

    // Always read through the gateway, which only ever proxies to the worktree's
    // live backend — reading this process's own DB would report the calling
    // worktree, not the requested target.
    const url = `http://${worktreeName}.localhost:9000/api/debug/queue-health/summary`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(
        `queue-health summary fetch failed (${res.status}) for worktree "${worktreeName}"`,
      );
    }
    const summary = QueueHealthSummarySchema.parse(await res.json());

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(summary, null, 2),
        },
      ],
    };
  },
});
