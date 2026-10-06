/**
 * The policy every previewed page runs under. The frame is already an opaque
 * origin (sandbox without `allow-same-origin`), so it cannot READ the app; this
 * stops it from SENDING to it — a script, image, form or fetch aimed at
 * `http://*.localhost` would otherwise reach the app's endpoints (a CSRF from a
 * downloaded file). Everything is limited to `https:` / `data:` / `blob:`,
 * which no local endpoint answers on.
 */
const PREVIEW_CSP = [
  "default-src https: data: blob: 'unsafe-inline' 'unsafe-eval'",
  "form-action https:",
  "base-uri 'none'",
].join("; ");

const DOCTYPE = /^\s*<!doctype[^>]*>/i;

/**
 * The page's markup with the preview CSP placed before anything of its own.
 * Right after the doctype (keeping standards mode): the parser opens an
 * implicit `<head>` for the `<meta>`, so it applies before the first script
 * the page carries, and a policy once applied cannot be removed by the page.
 */
export function isolateHtml(html: string): string {
  const meta = `<meta http-equiv="Content-Security-Policy" content="${PREVIEW_CSP}">`;
  const doctype = DOCTYPE.exec(html);
  return doctype
    ? doctype[0] + meta + html.slice(doctype[0].length)
    : meta + html;
}
