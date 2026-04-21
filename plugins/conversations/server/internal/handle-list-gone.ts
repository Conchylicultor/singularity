import { listGoneConversationsBefore } from "@plugins/tasks-core/server";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

export async function handleListGone(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const beforeStr = url.searchParams.get("before");
  const limitStr = url.searchParams.get("limit");

  if (!beforeStr) {
    return Response.json({ error: "Missing required param: before" }, { status: 400 });
  }

  const before = new Date(beforeStr);
  if (isNaN(before.getTime())) {
    return Response.json({ error: "Invalid date: before" }, { status: 400 });
  }

  const parsed = parseInt(limitStr ?? "", 10);
  const limit = Math.min(MAX_LIMIT, Math.max(1, isNaN(parsed) ? DEFAULT_LIMIT : parsed));

  const rows = await listGoneConversationsBefore(before, limit + 1);
  return Response.json({
    items: rows.slice(0, limit),
    hasMore: rows.length > limit,
  });
}
