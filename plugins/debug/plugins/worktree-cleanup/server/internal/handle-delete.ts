import { getAttempt } from "@plugins/tasks/plugins/tasks-core/server";
import { ndjsonResponse } from "@plugins/infra/plugins/ndjson-stream/server";
import { orphanDirPath } from "./dirs";
import { reapAttempt } from "./reap";

export async function handleDelete(
  _req: Request,
  params: Record<string, string>,
): Promise<Response> {
  const { id } = params;
  if (!id) return Response.json({ ok: false, error: "Missing id" }, { status: 400 });

  // An attempt row names the worktree when there is one; a dir orphan (listed by
  // handle-list, reaped by the hourly job) has none, so its path is resolved from
  // the canonical dir instead. Requiring one or the other keeps the 404 doing the
  // work the attempt lookup used to: an id matching neither reaches no filesystem
  // or database step at all.
  const attempt = await getAttempt(id);
  const worktreePath = attempt?.worktreePath ?? (await orphanDirPath(id));
  if (!worktreePath) {
    return Response.json({ ok: false, error: "No such attempt or worktree" }, { status: 404 });
  }

  return ndjsonResponse(async (emit) => {
    try {
      await reapAttempt(id, {
        worktreePath,
        onStep: (step) => emit({ step }),
      });
    } catch (e) {
      emit({ ok: false, error: String(e) });
      return;
    }
    emit({ ok: true });
  });
}
