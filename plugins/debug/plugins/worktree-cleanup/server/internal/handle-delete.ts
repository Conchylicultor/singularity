import { rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { getAttempt } from "@plugins/tasks-core/server";
import { dropDatabase } from "@plugins/database/plugins/admin/server";
import { removeWorktree } from "@plugins/infra/plugins/worktree/server";
import { SINGULARITY_DIR } from "@plugins/infra/plugins/paths/server";
import { ndjsonResponse } from "../../shared/ndjson";

export async function handleDelete(
  _req: Request,
  params: Record<string, string>,
): Promise<Response> {
  const { id } = params;
  if (!id) return Response.json({ ok: false, error: "Missing id" }, { status: 400 });

  const attempt = await getAttempt(id);
  if (!attempt) return Response.json({ ok: false, error: "Attempt not found" }, { status: 404 });

  return ndjsonResponse(async (emit) => {
    let dirPresent = false;
    try {
      await stat(attempt.worktreePath);
      dirPresent = true;
    // eslint-disable-next-line promise-safety/no-bare-catch
    } catch {
      // Directory already gone — skip git step
    }

    if (dirPresent) {
      emit({ step: "worktree" });
      try {
        await removeWorktree(attempt.worktreePath);
      } catch (e) {
        emit({ ok: false, error: String(e) });
        return;
      }
    }

    emit({ step: "database" });
    await dropDatabase(id);

    emit({ step: "config" });
    await rm(join(SINGULARITY_DIR, "config", id), { recursive: true, force: true });

    emit({ ok: true });
  });
}
