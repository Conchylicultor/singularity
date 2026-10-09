import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { IdKinds } from "@plugins/ids/server";
import { pageTagIdKind } from "../core";
import {
  createPageTag,
  deletePageTag,
  putPageTags,
  updatePageTag,
} from "../shared/endpoints";
import {
  pageTagAssignmentsServed,
  pageTagVocabularyServed,
} from "./internal/resource";
import {
  handleCreatePageTag,
  handleDeletePageTag,
  handlePutPageTags,
  handleUpdatePageTag,
} from "./internal/routes";

export {
  loadPageTags,
  resolveTagNames,
  setPageTags,
  writeResolvedPageTags,
} from "./internal/store";
export type { PageTag } from "./internal/store";
export type {
  ResolvedTag,
  TagRequest,
  TagResolution,
} from "./internal/resolve";

export default {
  description:
    "Page tags, server half: the page_tags vocabulary and the page_blocks_ext_tags assignments (one ordered tag-id list per tagged page), both served live; the vocabulary CRUD and per-page PUT endpoints; and the reads/writes other plugins use — loadPageTags (the <page-meta> header), resolveTagNames (name → tag, refusing unknown names unless created explicitly) and writeResolvedPageTags / setPageTags.",
  contributions: [
    IdKinds.Kind({ kind: pageTagIdKind }),
    ...pageTagVocabularyServed.declare,
    ...pageTagAssignmentsServed.declare,
  ],
  httpRoutes: {
    [putPageTags.route]: handlePutPageTags,
    [createPageTag.route]: handleCreatePageTag,
    [updatePageTag.route]: handleUpdatePageTag,
    [deletePageTag.route]: handleDeletePageTag,
  },
} satisfies ServerPluginDefinition;
