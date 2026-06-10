import { openShortLivedClient } from "@plugins/database/plugins/admin/server";

// Push/build bars are keyed by the bare worktree id (`att-x`), which is opaque.
// The conversation that drove the work carries a human title. Conversations are
// created in the main `singularity` DB before each worktree fork, so it is the
// one DB guaranteed to resolve any conversationId seen across all worktrees
// (a worktree's own fork only has conversations that existed at fork time).
export async function resolveConversationTitles(
  conversationIds: string[],
): Promise<Map<string, string>> {
  const titles = new Map<string, string>();
  const ids = [...new Set(conversationIds)];
  if (ids.length === 0) return titles;

  const pool = openShortLivedClient("singularity");
  try {
    const { rows } = await pool.query<{ id: string; title: string | null }>(
      "SELECT id, title FROM conversations WHERE id = ANY($1)",
      [ids],
    );
    for (const row of rows) {
      if (row.title) titles.set(row.id, row.title);
    }
  } finally {
    await pool.end();
  }
  return titles;
}
