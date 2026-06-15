import { z } from "zod";

export const LinkPreviewSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  siteName: z.string().optional(),
  imageId: z.string().optional(),
  faviconId: z.string().optional(),
});

export type LinkPreview = z.infer<typeof LinkPreviewSchema>;
