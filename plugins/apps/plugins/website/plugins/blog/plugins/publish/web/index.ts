import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { useBlogPosts, useBlogPost } from "./hooks";
export { setBlogPost, clearBlogPost } from "./internal/api";
export { blogPostsResource } from "../shared/schemas";
export type { BlogPost } from "../shared/schemas";
export { SLUG_RE } from "../shared/endpoints";

export default {
  description:
    "Blog publish marker (read hooks + set/clear mutations). No UI: useBlogPosts/useBlogPost, setBlogPost/clearBlogPost.",
  contributions: [],
} satisfies PluginDefinition;
