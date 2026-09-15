import { z } from "zod";

export const LinkPreviewSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  siteName: z.string().optional(),
  imageId: z.string().optional(),
  faviconId: z.string().optional(),
});

export type LinkPreview = z.infer<typeof LinkPreviewSchema>;

/** A page's title — absent when the page declares none. */
export const LinkMetaSchema = z.object({
  title: z.string().optional(),
});

export type LinkMeta = z.infer<typeof LinkMetaSchema>;
