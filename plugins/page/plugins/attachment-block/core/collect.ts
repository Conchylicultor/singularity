// The convention every attachment-owning page block follows: its managed
// attachment ids live in `data.attachmentId` (single) and/or `data.attachmentIds`
// (many). The generic reconcile links exactly these; the orphan sweep reclaims
// the rest.
export function collectBlockAttachmentIds(data: unknown): string[] {
  const out = new Set<string>();
  if (data && typeof data === "object") {
    const d = data as Record<string, unknown>;
    if (typeof d.attachmentId === "string") out.add(d.attachmentId);
    if (Array.isArray(d.attachmentIds))
      for (const x of d.attachmentIds) if (typeof x === "string") out.add(x);
  }
  return [...out];
}
