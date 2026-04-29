// Markdown image syntax used to embed attachments in prompt-style fields:
//   ![alt](/api/attachments/<uuid>)
// The same string is rendered inline by the editor (as a thumbnail) and stored
// verbatim in any text column. On agent-launch, callers use
// `rewriteAttachmentMarkdown` to swap each ref for `@<disk-path>` so Claude
// reads the file directly from disk.

const ATTACHMENT_URL_RE = /^\/api\/attachments\/([A-Za-z0-9_-]+)$/;
// Matches one markdown image: `![alt](url)`. Captures alt and url separately.
// Anchored to `!` to avoid eating regular `[link](url)` references.
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

// Replace each `![alt](/api/attachments/<id>)` with the result of `rewrite(id, alt)`.
// Non-attachment image refs pass through unchanged.
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
