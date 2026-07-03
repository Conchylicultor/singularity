import { describe, expect, test } from "bun:test";
import type { GmailMessage } from "@plugins/apps/plugins/mail/plugins/gmail-api/core";
import {
  decodeBase64Url,
  isInlineAttachment,
  parseAddress,
  parseAddressList,
  parseGmailMessage,
} from "./mime";

const b64 = (s: string) => Buffer.from(s).toString("base64url");

describe("parseAddress", () => {
  test('"Foo Bar" <foo@bar.com>', () => {
    expect(parseAddress('"Foo Bar" <foo@bar.com>')).toEqual({
      name: "Foo Bar",
      email: "foo@bar.com",
    });
  });

  test("bare foo@bar.com", () => {
    expect(parseAddress("foo@bar.com")).toEqual({ email: "foo@bar.com" });
  });

  test("Foo <foo@x>", () => {
    expect(parseAddress("Foo <foo@x>")).toEqual({ name: "Foo", email: "foo@x" });
  });
});

describe("parseAddressList", () => {
  test('"a@x, B <b@y>"', () => {
    expect(parseAddressList("a@x, B <b@y>")).toEqual([
      { email: "a@x" },
      { name: "B", email: "b@y" },
    ]);
  });

  test("empty / undefined", () => {
    expect(parseAddressList(undefined)).toEqual([]);
    expect(parseAddressList("")).toEqual([]);
  });

  test("comma inside quoted name is not a separator", () => {
    expect(parseAddressList('"Last, First" <lf@x>, b@y')).toEqual([
      { name: "Last, First", email: "lf@x" },
      { email: "b@y" },
    ]);
  });
});

describe("decodeBase64Url", () => {
  test("round-trips a known base64url string", () => {
    const original = "Hello, world! — café";
    expect(decodeBase64Url(b64(original))).toBe(original);
  });
});

describe("isInlineAttachment", () => {
  test("explicit `inline` disposition → inline", () => {
    expect(isInlineAttachment("inline", null)).toBe(true);
    expect(isInlineAttachment("inline; filename=logo.png", "<logo>")).toBe(true);
  });

  test("Content-ID with no disposition → inline (implicit cid reference)", () => {
    expect(isInlineAttachment("", "<logo>")).toBe(true);
  });

  test("explicit `attachment` disposition → real attachment, even with a Content-ID", () => {
    // Outlook/Exchange stamp Content-IDs on genuine attachments; disposition wins.
    expect(isInlineAttachment("attachment; filename=doc.pdf", "<doc>")).toBe(false);
    expect(isInlineAttachment("attachment", null)).toBe(false);
    expect(isInlineAttachment("  ATTACHMENT ; filename=x", "<x>")).toBe(false);
  });

  test("no disposition and no Content-ID → real attachment", () => {
    expect(isInlineAttachment("", null)).toBe(false);
  });
});

describe("parseGmailMessage", () => {
  test("text/plain only", () => {
    const msg: GmailMessage = {
      id: "m1",
      threadId: "t1",
      labelIds: ["INBOX", "UNREAD"],
      snippet: "hi there",
      internalDate: "1700000000000",
      payload: {
        mimeType: "text/plain",
        headers: [
          { name: "From", value: "Alice <alice@example.com>" },
          { name: "To", value: "bob@example.com" },
          { name: "Subject", value: "Hello" },
        ],
        body: { size: 5, data: b64("hello") },
      },
    };
    const parsed = parseGmailMessage(msg);
    expect(parsed.from).toEqual({ name: "Alice", email: "alice@example.com" });
    expect(parsed.to).toEqual([{ email: "bob@example.com" }]);
    expect(parsed.subject).toBe("Hello");
    expect(parsed.bodyText).toBe("hello");
    expect(parsed.bodyHtml).toBeNull();
    expect(parsed.replyTo).toBeNull();
    expect(parsed.labelIds).toEqual(["INBOX", "UNREAD"]);
    expect(parsed.internalDate).toEqual(new Date(1700000000000));
    expect(parsed.attachments).toEqual([]);
  });

  test("multipart/alternative (text + html)", () => {
    const msg: GmailMessage = {
      id: "m2",
      threadId: "t2",
      payload: {
        mimeType: "multipart/alternative",
        headers: [
          { name: "From", value: "a@x" },
          { name: "Reply-To", value: "reply@x" },
          { name: "Subject", value: "Alt" },
        ],
        parts: [
          { mimeType: "text/plain", body: { size: 4, data: b64("text") } },
          {
            mimeType: "text/html",
            body: { size: 11, data: b64("<p>html</p>") },
          },
        ],
      },
    };
    const parsed = parseGmailMessage(msg);
    expect(parsed.bodyText).toBe("text");
    expect(parsed.bodyHtml).toBe("<p>html</p>");
    expect(parsed.replyTo).toEqual([{ email: "reply@x" }]);
  });

  test("multipart/mixed: text part + real attachment + inline image", () => {
    const msg: GmailMessage = {
      id: "m3",
      threadId: "t3",
      payload: {
        mimeType: "multipart/mixed",
        headers: [{ name: "From", value: "a@x" }],
        parts: [
          { mimeType: "text/plain", body: { size: 4, data: b64("body") } },
          {
            mimeType: "application/pdf",
            filename: "report.pdf",
            headers: [
              { name: "Content-Disposition", value: "attachment; filename=report.pdf" },
            ],
            body: { attachmentId: "att-pdf", size: 1024 },
          },
          {
            mimeType: "image/png",
            filename: "logo.png",
            headers: [
              { name: "Content-ID", value: "<logo123>" },
              { name: "Content-Disposition", value: "inline" },
            ],
            body: { attachmentId: "att-img", size: 512 },
          },
        ],
      },
    };
    const parsed = parseGmailMessage(msg);
    expect(parsed.bodyText).toBe("body");
    expect(parsed.attachments).toEqual([
      {
        gmailAttachmentId: "att-pdf",
        filename: "report.pdf",
        mimeType: "application/pdf",
        sizeBytes: 1024,
        inline: false,
        contentId: null,
      },
      {
        gmailAttachmentId: "att-img",
        filename: "logo.png",
        mimeType: "image/png",
        sizeBytes: 512,
        inline: true,
        contentId: "logo123",
      },
    ]);
  });

  test("Outlook-style attachment with a Content-ID is a real attachment, not inline", () => {
    const msg: GmailMessage = {
      id: "m4",
      threadId: "t4",
      payload: {
        mimeType: "multipart/mixed",
        headers: [{ name: "From", value: "a@x" }],
        parts: [
          { mimeType: "text/html", body: { size: 6, data: b64("<p/>x") } },
          {
            mimeType: "application/pdf",
            filename: "invoice.pdf",
            headers: [
              { name: "Content-ID", value: "<invoice@outlook>" },
              {
                name: "Content-Disposition",
                value: "attachment; filename=invoice.pdf",
              },
            ],
            body: { attachmentId: "att-inv", size: 2048 },
          },
        ],
      },
    };
    const parsed = parseGmailMessage(msg);
    // Disposition `attachment` wins over the Content-ID → shows a reader chip AND
    // matches Gmail's `has:attachment` paperclip.
    expect(parsed.attachments).toEqual([
      {
        gmailAttachmentId: "att-inv",
        filename: "invoice.pdf",
        mimeType: "application/pdf",
        sizeBytes: 2048,
        inline: false,
        contentId: "invoice@outlook",
      },
    ]);
  });
});
