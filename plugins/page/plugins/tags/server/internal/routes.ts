import { implement } from "@plugins/infra/plugins/endpoints/server";
import {
  createPageTag,
  deletePageTag,
  putPageTags,
  updatePageTag,
} from "../../shared/endpoints";
import {
  createPageTag as createTag,
  deletePageTag as deleteTag,
  setPageTags,
  updatePageTag as updateTag,
} from "./store";

export const handlePutPageTags = implement(
  putPageTags,
  async ({ params, body }) => {
    await setPageTags(params.pageId, body.tagIds);
  },
);

export const handleCreatePageTag = implement(createPageTag, async ({ body }) =>
  createTag(body.name, body.color),
);

export const handleUpdatePageTag = implement(
  updatePageTag,
  async ({ params, body }) => {
    await updateTag(params.tagId, body);
  },
);

export const handleDeletePageTag = implement(
  deletePageTag,
  async ({ params }) => {
    await deleteTag(params.tagId);
  },
);
