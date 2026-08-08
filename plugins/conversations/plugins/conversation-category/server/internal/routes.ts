import { implement, HttpError } from "@plugins/infra/plugins/endpoints/server";
import type { HttpHandler } from "@plugins/framework/plugins/server-core/core";
import {
  ClassifyBodySchema,
  setConversationCategory,
  clearConversationCategory,
} from "../../shared/endpoints";
import { findCategory } from "./categories";
import { deleteCategoryRow, upsertCategoryRows } from "./store";
import { classifyConversationJob } from "./classify-job";

// Returns 202 Accepted — implement() always returns 200, so use a raw handler here.
export const handleClassify: HttpHandler = async (req, params) => {
  const conversationId = params.conversationId;
  if (!conversationId) {
    return Response.json(
      { error: "Missing conversationId in path" },
      { status: 400 },
    );
  }

  // An absent body means "every category"; a `categoryIds` list restricts the
  // run to those, which is how one chip re-classifies only its own category.
  const text = await req.text();
  let body: unknown = {};
  if (text) {
    try {
      body = JSON.parse(text);
    } catch (err) {
      if (!(err instanceof SyntaxError)) throw err;
      return Response.json(
        { error: `Body is not valid JSON: ${err.message}` },
        { status: 400 },
      );
    }
  }
  const parsed = ClassifyBodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.message }, { status: 400 });
  }

  await classifyConversationJob.enqueue({
    conversationId,
    categoryIds: parsed.data.categoryIds,
    force: true,
  });
  return Response.json({ ok: true }, { status: 202 });
};

export const handleSetCategory = implement(
  setConversationCategory,
  async ({ params, body }) => {
    // Validate against the configured categories — the UI offers these as
    // choices, but a stale tab or a direct API caller could pass anything, and
    // the chip must never display an item the picker no longer offers.
    const category = findCategory(body.categoryId);
    if (!category) {
      throw new HttpError(
        400,
        `category "${body.categoryId}" is not in the configured list`,
      );
    }
    if (!category.items.some((i) => i.name === body.item)) {
      throw new HttpError(
        400,
        `item "${body.item}" is not in category "${category.name}"`,
      );
    }

    await upsertCategoryRows(
      params.conversationId,
      [{ categoryId: body.categoryId, item: body.item }],
      "manual",
    );
  },
);

// Deliberately does NOT validate the category against config: clearing a row
// whose category was deleted from config is exactly when you need this to work.
export const handleClearCategory = implement(
  clearConversationCategory,
  async ({ params }) => {
    await deleteCategoryRow(params.conversationId, params.categoryId);
  },
);
