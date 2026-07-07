import { z } from "zod";
import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";

// Lowercase kebab-case: alphanumeric runs joined by single hyphens, no leading/
// trailing/double hyphens. Used as the public post URL segment (`/blog/:slug`).
export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const SetBlogPostBodySchema = z.object({
  slug: z.string().regex(SLUG_RE, "Slug must be lowercase kebab-case (a-z, 0-9, hyphens)."),
  summary: z.string().nullable().optional(),
  published: z.boolean(),
});

// `pageId` is the path param (like marker's `/api/stories/:pageId`); the body
// carries the mutable publish fields. Publishing sets `published_at` to now()
// only on the null→true edge; unpublishing clears it; slug/summary always upsert.
export const setBlogPost = defineEndpoint({
  route: "PUT /api/blog/:pageId",
  body: SetBlogPostBodySchema,
});

// Removes the publish-marker row entirely (the page itself is untouched).
export const clearBlogPost = defineEndpoint({
  route: "DELETE /api/blog/:pageId",
});
