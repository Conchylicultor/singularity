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
  return json(
    Object.fromEntries(
      rows.map((r) => [r.category, {
        colorKey: r.colorKey ?? null,
        iconKey: r.iconKey ?? null,
        iconSvgNodes: r.iconSvgNodes ?? null,
      }]),
    ),
  );
}

export async function handleSetColor(req: Request): Promise<Response> {
  let body: { category?: string; colorKey?: string | null; iconKey?: string | null; iconSvgNodes?: string | null };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return json({ error: "invalid-json" }, 400);
  }
  const { category, colorKey, iconKey, iconSvgNodes } = body;
  if (!category) return json({ error: "missing-category" }, 400);
  if (colorKey === undefined && iconKey === undefined) {
    return json({ error: "missing-fields" }, 400);
  }

  if (colorKey === null && iconKey === null) {
    await db
      .delete(_conversationCategoryColors)
      .where(eq(_conversationCategoryColors.category, category));
    categoryColorsResource.notify();
    return json({ ok: true });
  }

  await db
    .insert(_conversationCategoryColors)
    .values({
      category,
      colorKey: colorKey ?? null,
      iconKey: iconKey ?? null,
      iconSvgNodes: iconSvgNodes ?? null,
    })
    .onConflictDoUpdate({
      target: _conversationCategoryColors.category,
      set: {
        ...(colorKey !== undefined ? { colorKey: colorKey ?? null } : {}),
        ...(iconKey !== undefined ? { iconKey: iconKey ?? null } : {}),
        ...(iconSvgNodes !== undefined ? { iconSvgNodes: iconSvgNodes ?? null } : {}),
        updatedAt: new Date(),
      },
    });
  categoryColorsResource.notify();
  return json({ ok: true });
}

export async function handleDeleteColor(
  _req: Request,
  params: Record<string, string>,
): Promise<Response> {
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard, no noUncheckedIndexedAccess
  const category = decodeURIComponent(params.category ?? "");
  if (!category) return json({ error: "missing-category" }, 400);
  await db
    .delete(_conversationCategoryColors)
    .where(eq(_conversationCategoryColors.category, category));
  categoryColorsResource.notify();
  return json({ ok: true });
}
