import { stat } from "node:fs/promises";
import { getAttempt } from "@plugins/tasks-core/server";
import { dropDatabase } from "@plugins/database/plugins/admin/server";
import { removeWorktree } from "@plugins/infra/plugins/worktree/server";

const CONCURRENCY = 4;

async function deleteOne(id: string): Promise<{ id: string; ok: true } | { id: string; ok: false; error: string }> {
  const attempt = await getAttempt(id);
  if (!attempt) return { id, ok: false, error: "Attempt not found" };

  let dirPresent = false;
  try {
    await stat(attempt.worktreePath);
    dirPresent = true;
  } catch {
    // already gone
  }

  if (dirPresent) {
    try {
      await removeWorktree(attempt.worktreePath);
    } catch (e) {
      return { id, ok: false, error: String(e) };
    }
  }

  await dropDatabase(id);
  return { id, ok: true };
}

export async function handleBulkDelete(_req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await _req.json();
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  if (!Array.isArray((body as { ids?: unknown }).ids)) {
    return Response.json({ ok: false, error: "ids must be an array" }, { status: 400 });
  }

  const ids = (body as { ids: unknown[] }).ids.filter((x): x is string => typeof x === "string");
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
  const failed = results.filter((r) => !r.ok);

  return Response.json({ ok: true, succeeded, failed });
}
