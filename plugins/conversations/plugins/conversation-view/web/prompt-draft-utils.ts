import { ATTACHMENT_MARKDOWN_RE } from "@plugins/primitives/plugins/paste-images/web";

export function isDraftEmpty(markdown: string): boolean {
  return markdown.trim().length === 0;
}

// Strip attachment image refs from the markdown — useful when seeding a
// title or a preview that shouldn't include the inline image markdown.
export function draftToPlainText(markdown: string): string {
  return markdown
    .replace(new RegExp(ATTACHMENT_MARKDOWN_RE.source, "g"), "")
    .trim();
}
