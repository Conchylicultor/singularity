const ATTACHMENT_URL_RE = /^\/api\/attachments\/([A-Za-z0-9_-]+)$/;
export const ATTACHMENT_MARKDOWN_RE = /!\[([^\]]*)\]\(([^)\s]+)\)/g;

export function attachmentUrl(id: string): string {
  return `/api/attachments/${id}`;
}

export function attachmentMarkdown(id: string, alt = ""): string {
  return `![${alt}](${attachmentUrl(id)})`;
}

export function isAttachmentUrl(url: string): string | null {
  const m = ATTACHMENT_URL_RE.exec(url);
  return m?.[1] ?? null;
}

export function extractAttachmentIds(markdown: string): string[] {
  const ids = new Set<string>();
  for (const m of markdown.matchAll(ATTACHMENT_MARKDOWN_RE)) {
    const id = isAttachmentUrl(m[2]!);
    if (id) ids.add(id);
  }
  return Array.from(ids);
}

export function rewriteAttachmentMarkdown(
  markdown: string,
  rewrite: (id: string, alt: string) => string,
): string {
  return markdown.replace(
    ATTACHMENT_MARKDOWN_RE,
    (whole: string, alt: string, url: string) => {
      const id = isAttachmentUrl(url);
      return id ? rewrite(id, alt) : whole;
    },
  );
}
