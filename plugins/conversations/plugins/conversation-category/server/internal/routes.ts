import { eq } from "drizzle-orm";
import { db } from "@server/db/client";
import { readConfig } from "@plugins/config/server";
import { upsertExtension } from "@plugins/infra/plugins/entity-extensions/server";
import { conversationCategoryConfig } from "../../shared/config";
import { _conversationCategoryExt } from "./tables";
import { conversationCategoriesResource } from "./resource";
import { classifyConversationJob } from "./classify-job";

export async function handleClassify(
  _req: Request,
  params: Record<string, string>,
): Promise<Response> {
  const conversationId = params.conversationId;
  if (!conversationId) {
    return Response.json(
      { error: "Missing conversationId in path" },
      { status: 400 },
    );
  }
  await classifyConversationJob.enqueue({
    conversationId,
    force: true,
  });
  return Response.json({ ok: true }, { status: 202 });
}

interface SetCategoryBody {
  category: string;
}

export async function handleSetCategory(
  req: Request,
  params: Record<string, string>,
): Promise<Response> {
  const conversationId = params.conversationId;
  if (!conversationId) {
    return Response.json(
      { error: "Missing conversationId in path" },
      { status: 400 },
    );
  }
  const body = (await req.json().catch(() => null)) as SetCategoryBody | null;
  const category = body?.category;
  if (typeof category !== "string" || category.trim() === "") {
    return Response.json(
      { error: "category (non-empty string) required" },
      { status: 400 },
    );
  }

  // Validate against the configured list — the UI offers these as choices,
  // but a stale tab or direct API caller could pass anything; reject early
  // so the chip never displays a label that's not in the picker.
  const { categories } = await readConfig(conversationCategoryConfig);
  if (!categories.includes(category)) {
    return Response.json(
      { error: `category "${category}" is not in the configured list` },
      { status: 400 },
    );
  }

  await upsertExtension(_conversationCategoryExt, conversationId, {
    category,
    source: "manual",
  });
  conversationCategoriesResource.notify();

  return Response.json({ ok: true });
}

export async function handleClearCategory(
  _req: Request,
  params: Record<string, string>,
): Promise<Response> {
  const conversationId = params.conversationId;
  if (!conversationId) {
    return Response.json(
      { error: "Missing conversationId in path" },
      { status: 400 },
    );
  }
  await db
    .delete(_conversationCategoryExt)
    .where(eq(_conversationCategoryExt.parentId, conversationId));
  conversationCategoriesResource.notify();
  return Response.json({ ok: true });
}
