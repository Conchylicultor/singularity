import { getAttempt } from "@plugins/tasks/plugins/tasks-core/server";
import { implement } from "@plugins/infra/plugins/endpoints/server";
import { bulkDeleteWorktrees } from "../../shared/endpoints";
import { reapAttempt } from "./reap";

const CONCURRENCY = 4;

async function deleteOne(id: string): Promise<{ id: string; ok: true } | { id: string; ok: false; error: string }> {
  const attempt = await getAttempt(id);
  if (!attempt) return { id, ok: false, error: "Attempt not found" };

  try {
    await reapAttempt(id, { worktreePath: attempt.worktreePath });
  } catch (e) {
    return { id, ok: false, error: String(e) };
  }
  return { id, ok: true };
}

export const handleBulkDelete = implement(bulkDeleteWorktrees, async ({ body }) => {
  const { ids } = body;
  const results: ({ id: string; ok: true } | { id: string; ok: false; error: string })[] = [];

  // Process with bounded concurrency to avoid overwhelming git locks and Postgres
  let i = 0;
  while (i < ids.length) {
    const batch = ids.slice(i, i + CONCURRENCY);
    const batchResults = await Promise.all(batch.map(deleteOne));
    results.push(...batchResults);
    i += CONCURRENCY;
  }

  const succeeded = results.filter((r) => r.ok).length;
  const failed = results.filter(
    (r): r is { id: string; ok: false; error: string } => !r.ok,
  );

  return { succeeded, failed };
});
