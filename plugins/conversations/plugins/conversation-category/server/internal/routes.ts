import { getConfig } from "@plugins/config_v2/server";
import { implement, HttpError } from "@plugins/infra/plugins/endpoints/server";
import type { HttpHandler } from "@plugins/framework/plugins/server-core/core";
import { conversationCategoryConfig } from "../../shared/config";
import {
  setConversationCategory,
  clearConversationCategory,
} from "../../shared/endpoints";
import { conversationCategory } from "./tables";
import { classifyConversationJob } from "./classify-job";

// Returns 202 Accepted — implement() always returns 200, so use a raw handler here.
export const handleClassify: HttpHandler = async (_req, params) => {
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
};

export const handleSetCategory = implement(setConversationCategory, async ({ params, body }) => {
  // Validate against the configured list — the UI offers these as choices,
  // but a stale tab or direct API caller could pass anything; reject early
  // so the chip never displays a label that's not in the picker.
  const { categories } = getConfig(conversationCategoryConfig);
  const categoryNames = categories.map((c) => c.name);
  if (!categoryNames.includes(body.category)) {
    throw new HttpError(400, `category "${body.category}" is not in the configured list`);
  }

  await conversationCategory.upsert(params.conversationId, {
    category: body.category,
    source: "manual",
  });
});

export const handleClearCategory = implement(clearConversationCategory, async ({ params }) => {
  await conversationCategory.delete(params.conversationId);
});
