import { getAttempt } from "@plugins/tasks/plugins/tasks-core/server";
import { ndjsonResponse } from "../../shared/ndjson";
import { reapAttempt } from "./reap";

export async function handleDelete(
  _req: Request,
  params: Record<string, string>,
): Promise<Response> {
  const { id } = params;
  if (!id) return Response.json({ ok: false, error: "Missing id" }, { status: 400 });

  const attempt = await getAttempt(id);
  if (!attempt) return Response.json({ ok: false, error: "Attempt not found" }, { status: 404 });

  return ndjsonResponse(async (emit) => {
    try {
      await reapAttempt(id, {
        worktreePath: attempt.worktreePath,
        onStep: (step) => emit({ step }),
      });
    } catch (e) {
      emit({ ok: false, error: String(e) });
      return;
    }
    emit({ ok: true });
  });
}
