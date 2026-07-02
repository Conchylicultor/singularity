// Pure heuristics for detecting where an email's *quoted reply history* begins.
// The DOM walk (process-email-html) applies these to candidate elements; the
// first match (or a structural `.gmail_quote` / top-level `<blockquote>`) marks
// the boundary, and everything from there down is collapsed behind a toggle.

/** True if a className carries Gmail's `gmail_quote` marker. */
export function isGmailQuoteClass(className: string): boolean {
  return /\bgmail_quote\b/.test(className);
}

const DIVIDER_RES: RegExp[] = [
  // Outlook / classic mail clients.
  /^-{2,}\s*Original Message\s*-{2,}/i,
  // Gmail / clients forwarding inline.
  /^-{2,}\s*Forwarded message\s*-{2,}/i,
];

/**
 * True if a short text fragment reads like a quoted-reply divider:
 *   - "-----Original Message-----" / "---------- Forwarded message ----------"
 *   - "On <date>, <name> wrote:"     (Gmail / Apple Mail attribution line)
 *   - an Outlook "From: … Sent: …"   header block
 *
 * Only meaningful for short fragments — callers must length-guard so a wrapper
 * element whose textContent is the divider *plus the whole quote* isn't matched.
 * English-only for now (i18n attribution lines are a later concern).
 */
export function isQuoteDividerText(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  for (const re of DIVIDER_RES) if (re.test(t)) return true;
  // "On Mon, Jan 1, 2020 at 3:00 PM, John Doe <j@x.com> wrote:" — the bounded
  // gap keeps this from spanning into the quoted body itself.
  if (/^On\b[\s\S]{0,240}\bwrote:\s*$/i.test(t)) return true;
  // Outlook forwarded-header block: "From: … Sent: … To: … Subject: …".
  if (/^From:\s/i.test(t) && /\bSent:\s/i.test(t)) return true;
  return false;
}
