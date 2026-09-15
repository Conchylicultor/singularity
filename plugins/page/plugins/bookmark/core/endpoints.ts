import { z } from "zod";
import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";
import { LinkMetaSchema, LinkPreviewSchema } from "./schemas";

export const linkPreviewEndpoint = defineEndpoint({
  route: "GET /api/link-preview",
  query: z.object({ url: z.string() }),
  response: LinkPreviewSchema,
});

/**
 * The light twin of `linkPreviewEndpoint`: the same SSRF-guarded fetch and
 * parse, but it downloads no image. For callers that want only the page's
 * title (the pasted-link Mention) — every `/api/link-preview` call caches the
 * og:image and favicon as attachments, which nothing would ever link.
 */
export const linkMetaEndpoint = defineEndpoint({
  route: "GET /api/link-meta",
  query: z.object({ url: z.string() }),
  response: LinkMetaSchema,
});
