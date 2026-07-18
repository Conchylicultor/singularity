import { openShortLivedClient } from "@plugins/database/plugins/admin/server";

// Push/build bars are keyed by the bare worktree id (`att-x`). That id is, by a
// hard invariant, the attempt id: agent worktrees live at
// `<root>/.claude/worktrees/<attemptId>`, so `basename(worktreePath) ===
// attempt.id` (see tasks-core cross-table.adoptOrphanConversation). Every
// attempt belongs to a task and `tasks.title` is NOT NULL — so the worktree id
// alone resolves a human label for the row, with no conversationId needed.
//
// This is what lets build-only rows show a title instead of the opaque id:
// builds carry no conversationId, but they do carry the worktree id. Resolving
// off the attempt also prefers the stable task title over an ambiguous
// per-conversation one (an attempt can own several conversations).
//
// Attempts/tasks are created in the main `singularity` DB before each worktree
// fork, so it is the one DB guaranteed to resolve any attempt id seen across all
// worktrees (a worktree's own fork only has rows that existed at fork time).
export async function resolveWorktreeTitles(
  worktreeIds: string[],
): Promise<Map<string, string>> {
  const titles = new Map<string, string>();
  const ids = [...new Set(worktreeIds)];
  if (ids.length === 0) return titles;

  const pool = openShortLivedClient("singularity");
  try {
    const { rows } = await pool.query<{ worktree: string; title: string }>(
      `SELECT a.id AS worktree, t.title AS title
         FROM attempts a
         JOIN tasks t ON t.id = a.task_id
        WHERE a.id = ANY($1)`,
      [ids],
    );
    for (const row of rows) {
      if (row.title) titles.set(row.worktree, row.title);
    }
  } finally {
    await pool.end();
  }
  return titles;
}
