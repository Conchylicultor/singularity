import { text } from "drizzle-orm/pg-core";
import { _blocks } from "@plugins/page/plugins/editor/server";
import { defineExtension } from "@plugins/infra/plugins/entity-extensions/server";

// page_blocks_ext_story(parent_id PK FK→page_blocks CASCADE, default_renderer_id text NULL, created_at, updated_at)
export const storyMark = defineExtension(_blocks, "story", {
  defaultRendererId: text("default_renderer_id"), // nullable: marking with no preference
});
export const _storyMarkExt = storyMark.table; // re-exported so drizzle-kit's glob picks it up
