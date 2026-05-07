import { eq } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { _conversationCategoryColors } from "./tables-colors";
import { categoryColorsResource } from "./colors-resource";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export async function handleGetColors(): Promise<Response> {
  const rows = await db.select().from(_conversationCategoryColors);
  return json(Object.fromEntries(rows.map((r) => [r.category, r.colorKey])));
}

export async function handleSetColor(req: Request): Promise<Response> {
  let body: { category?: string; colorKey?: string };
  try {
    body = (await req.json()) as { category?: string; colorKey?: string };
  } catch {
    return json({ error: "invalid-json" }, 400);
  }
  const { category, colorKey } = body;
  if (!category || !colorKey) {
    return json({ error: "missing-fields" }, 400);
  }
  await db
    .insert(_conversationCategoryColors)
    .values({ category, colorKey })
    .onConflictDoUpdate({
      target: _conversationCategoryColors.category,
      set: { colorKey, updatedAt: new Date() },
    });
  categoryColorsResource.notify();
  return json({ ok: true });
}

export async function handleDeleteColor(
  _req: Request,
  params: Record<string, string>,
): Promise<Response> {
  const category = decodeURIComponent(params.category ?? "");
  if (!category) return json({ error: "missing-category" }, 400);
  await db
    .delete(_conversationCategoryColors)
    .where(eq(_conversationCategoryColors.category, category));
  categoryColorsResource.notify();
  return json({ ok: true });
}
