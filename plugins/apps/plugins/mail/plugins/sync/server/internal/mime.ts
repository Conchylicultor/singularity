import type {
  GmailHeader,
  GmailMessage,
  GmailMessagePart,
} from "@plugins/apps/plugins/mail/plugins/gmail-api/core";
import type { MailAddress } from "@plugins/apps/plugins/mail/plugins/mail-core/core";

// Pure Gmail-payload MIME parser. No DB, no network — a deterministic function
// of one `GmailMessage` wire object, so it is fully unit-testable (see the
// co-located `mime.test.ts`). The sync engine's storage layer calls
// `parseGmailMessage` to derive the envelope, bodies, label set, and attachment
// metadata it mirrors into the mail-core tables.

export interface ParsedAttachment {
  gmailAttachmentId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  inline: boolean;
  contentId: string | null;
}

export interface ParsedMessage {
  from: MailAddress;
  to: MailAddress[];
  cc: MailAddress[];
  bcc: MailAddress[];
  replyTo: MailAddress[] | null;
  subject: string | null;
  snippet: string | null;
  headers: Record<string, string>;
  bodyText: string | null;
  bodyHtml: string | null;
  internalDate: Date | null;
  labelIds: string[];
  attachments: ParsedAttachment[];
}

/** Build a lowercased-key header map (last wins) from a Gmail header array. */
export function headerMap(headers?: GmailHeader[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const h of headers ?? []) {
    map[h.name.toLowerCase()] = h.value;
  }
  return map;
}

/** Decode a Gmail base64url body part to a UTF-8 string. */
export function decodeBase64Url(data: string): string {
  return Buffer.from(data, "base64url").toString("utf8");
}

/**
 * Parse a single RFC-5322-ish address. Handles `Display Name <email@x>` and a
 * bare `email@x`. Surrounding quotes on the display name are stripped. When
 * there are no angle brackets the whole string is treated as the email with no
 * name.
 */
export function parseAddress(value: string): MailAddress {
  const trimmed = value.trim();
  const angle = trimmed.match(/^(.*)<([^>]*)>\s*$/);
  if (angle) {
    const rawName = (angle[1] ?? "").trim().replace(/^"|"$/g, "").trim();
    const email = (angle[2] ?? "").trim();
    return rawName ? { name: rawName, email } : { email };
  }
  return { email: trimmed };
}

/**
 * Parse a comma-separated address-list header into `MailAddress[]`.
 *
 * Limitation: this splits on every top-level comma that is not inside angle
 * brackets or a double-quoted segment. A display name containing an *escaped*
 * quote (`\"`) is not handled — acceptable for mirroring Gmail-normalized
 * headers, where such cases are vanishingly rare.
 */
export function parseAddressList(value: string | undefined): MailAddress[] {
  if (!value) return [];
  const parts: string[] = [];
  let buf = "";
  let inQuote = false;
  let inAngle = false;
  for (const ch of value) {
    if (ch === '"' && !inAngle) {
      inQuote = !inQuote;
      buf += ch;
    } else if (ch === "<" && !inQuote) {
      inAngle = true;
      buf += ch;
    } else if (ch === ">" && !inQuote) {
      inAngle = false;
      buf += ch;
    } else if (ch === "," && !inQuote && !inAngle) {
      if (buf.trim()) parts.push(buf);
      buf = "";
    } else {
      buf += ch;
    }
  }
  if (buf.trim()) parts.push(buf);
  return parts.map(parseAddress);
}

interface BodyAcc {
  bodyText: string | null;
  bodyHtml: string | null;
  attachments: ParsedAttachment[];
}

function isAttachmentPart(part: GmailMessagePart): boolean {
  return Boolean(
    (part.filename && part.filename.length > 0) || part.body?.attachmentId,
  );
}

function walkPayload(part: GmailMessagePart | undefined, acc: BodyAcc): void {
  if (!part) return;

  if (isAttachmentPart(part)) {
    const partHeaders = headerMap(part.headers);
    const contentId =
      partHeaders["content-id"]?.replace(/^<|>$/g, "") ?? null;
    const disposition = partHeaders["content-disposition"] ?? "";
    acc.attachments.push({
      gmailAttachmentId: part.body?.attachmentId ?? "",
      filename:
        part.filename && part.filename.length > 0
          ? part.filename
          : (contentId ?? "attachment"),
      mimeType: part.mimeType ?? "application/octet-stream",
      sizeBytes: part.body?.size ?? 0,
      inline: disposition.trim().toLowerCase().startsWith("inline") || contentId != null,
      contentId,
    });
  } else if (part.mimeType === "text/plain" && part.body?.data) {
    acc.bodyText = decodeBase64Url(part.body.data);
  } else if (part.mimeType === "text/html" && part.body?.data) {
    // last wins — html is preferred for multipart/alternative
    acc.bodyHtml = decodeBase64Url(part.body.data);
  }

  for (const child of part.parts ?? []) {
    walkPayload(child, acc);
  }
}

/** Parse a full Gmail message into its envelope, bodies, labels, attachments. */
export function parseGmailMessage(msg: GmailMessage): ParsedMessage {
  const payload = msg.payload;
  const headers = headerMap(payload?.headers);

  const fromHeader = headers["from"];
  const replyToHeader = headers["reply-to"];

  const acc: BodyAcc = { bodyText: null, bodyHtml: null, attachments: [] };
  walkPayload(payload, acc);

  return {
    from: fromHeader ? parseAddress(fromHeader) : { email: "" },
    to: parseAddressList(headers["to"]),
    cc: parseAddressList(headers["cc"]),
    bcc: parseAddressList(headers["bcc"]),
    replyTo: replyToHeader === undefined ? null : parseAddressList(replyToHeader),
    subject: headers["subject"] ?? null,
    snippet: msg.snippet ?? null,
    headers,
    bodyText: acc.bodyText,
    bodyHtml: acc.bodyHtml,
    internalDate: msg.internalDate ? new Date(Number(msg.internalDate)) : null,
    labelIds: msg.labelIds ?? [],
    attachments: acc.attachments,
  };
}
