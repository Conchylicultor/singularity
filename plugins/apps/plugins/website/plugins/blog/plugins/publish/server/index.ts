import { Resource } from "@plugins/framework/plugins/server-core/core";
import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { blogPostsResource } from "./internal/resource";
import { handleSetBlogPost, handleClearBlogPost } from "./internal/routes";
import { setBlogPost, clearBlogPost } from "../shared/endpoints";

export { blogPost } from "./internal/tables";
export { getBlogPost, setBlogPost, clearBlogPost } from "./internal/mutations";
export { blogPostsResource } from "./internal/resource";

export default {
  description:
    "Blog publish marker: page_blocks_ext_blog_post side-table (entity-extensions), blogPostsResource, set/clear endpoints.",
  contributions: [Resource.Declare(blogPostsResource)],
  httpRoutes: {
    [setBlogPost.route]: handleSetBlogPost,
    [clearBlogPost.route]: handleClearBlogPost,
  },
} satisfies ServerPluginDefinition;
