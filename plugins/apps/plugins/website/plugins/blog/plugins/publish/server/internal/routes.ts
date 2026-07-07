import { implement } from "@plugins/infra/plugins/endpoints/server";
import { setBlogPost, clearBlogPost } from "../../shared/endpoints";
import {
  setBlogPost as setBlogPostMutation,
  clearBlogPost as clearBlogPostMutation,
} from "./mutations";

export const handleSetBlogPost = implement(setBlogPost, async ({ params, body }) => {
  await setBlogPostMutation(params.pageId, {
    slug: body.slug,
    summary: body.summary ?? null,
    published: body.published,
  });
});

export const handleClearBlogPost = implement(clearBlogPost, async ({ params }) => {
  await clearBlogPostMutation(params.pageId);
});
