import { db } from "@plugins/database/server";
import { defineResource } from "@plugins/framework/plugins/server-core/core";
import {
  StoryMarksPayloadSchema,
  type StoryMarksPayload,
} from "../../shared/schemas";
import { storyMark } from "./tables";

const t = storyMark.table;

export const storiesResource = defineResource<StoryMarksPayload>({
  key: "stories",
  mode: "push",
  schema: StoryMarksPayloadSchema,
  loader: async () => {
    const rows = await db
      .select({
        pageId: t.parentId,
        defaultRendererId: t.defaultRendererId,
        updatedAt: t.updatedAt,
      })
      .from(t);
    const out: StoryMarksPayload = {};
    for (const r of rows) out[r.pageId] = r;
    return out;
  },
});
