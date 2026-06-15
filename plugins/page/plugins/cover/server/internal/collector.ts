import { PageDataSchema } from "@plugins/page/plugins/editor/core";

// A page block's cover image is an attachment referenced at the nested
// `data.cover.attachmentId` — outside attachment-block's flat
// `data.attachmentId` convention — so the shared reconcile can't see it without
// this collector. Safe-parses the page-block data so non-page blocks (and any
// malformed legacy data) simply yield no ids rather than throwing the reconcile.
export function collectCoverAttachmentIds(data: unknown): string[] {
  const parsed = PageDataSchema.safeParse(data);
  if (!parsed.success) return [];
  const cover = parsed.data.cover;
  return cover && cover.type === "image" ? [cover.attachmentId] : [];
}
