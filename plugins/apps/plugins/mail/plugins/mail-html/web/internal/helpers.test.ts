import { describe, it, expect } from "bun:test";
import { parseCidSrc } from "./cid";
import {
  isRemoteHttpUrl,
  extractCssHttpUrls,
  rewriteCssHttpUrls,
} from "./remote-url";
import { isGmailQuoteClass, isQuoteDividerText } from "./quote-boundary";

// These cover the *pure* string heuristics. The DOM-bound behavior (DOMPurify
// sanitize, image gating, quote splitting on real markup) is exercised by the
// jsdom test in web/__tests__ — DOMPurify needs a DOM and can't run here.

describe("parseCidSrc", () => {
  it("extracts the bare content-id, stripping scheme/brackets/space", () => {
    expect(parseCidSrc("cid:ii_abc123@mail.gmail.com")).toBe(
      "ii_abc123@mail.gmail.com",
    );
    expect(parseCidSrc("  cid:<part-1@x> ")).toBe("part-1@x");
    expect(parseCidSrc("CID:Upper")).toBe("Upper");
  });

  it("returns null for non-cid sources", () => {
    expect(parseCidSrc("https://x/y.png")).toBeNull();
    expect(parseCidSrc("data:image/png;base64,AAA")).toBeNull();
    expect(parseCidSrc("")).toBeNull();
  });
});

describe("isRemoteHttpUrl", () => {
  it("is true only for absolute http(s) URLs", () => {
    expect(isRemoteHttpUrl("http://x/y.gif")).toBe(true);
    expect(isRemoteHttpUrl("https://x/y.gif")).toBe(true);
    expect(isRemoteHttpUrl("  https://x ")).toBe(true);
    expect(isRemoteHttpUrl("cid:abc")).toBe(false);
    expect(isRemoteHttpUrl("data:image/png;base64,AAA")).toBe(false);
    expect(isRemoteHttpUrl("/relative.png")).toBe(false);
  });
});

describe("css url() helpers", () => {
  it("extracts only remote http urls", () => {
    const css =
      "background: url('https://t.example/px.gif') , url(data:image/gif;base64,AA), url(/local.png)";
    expect(extractCssHttpUrls(css)).toEqual(["https://t.example/px.gif"]);
  });

  it("rewrites remote urls and leaves data:/relative untouched", () => {
    const css = "background-image: url(https://x/a.png)";
    expect(
      rewriteCssHttpUrls(css, (u) => `/proxy?u=${encodeURIComponent(u)}`),
    ).toBe('background-image: url("/proxy?u=https%3A%2F%2Fx%2Fa.png")');
  });

  it("drops a remote url to `none` when the map returns null (blocked)", () => {
    expect(rewriteCssHttpUrls("background: url(https://x/a.png)", () => null)).toBe(
      "background: none",
    );
    // data: reference is not http, so it is never touched by the gate.
    expect(
      rewriteCssHttpUrls("background: url(data:image/gif;base64,AA)", () => null),
    ).toBe("background: url(data:image/gif;base64,AA)");
  });
});

describe("isGmailQuoteClass", () => {
  it("detects the gmail_quote marker among other classes", () => {
    expect(isGmailQuoteClass("gmail_quote")).toBe(true);
    expect(isGmailQuoteClass("foo gmail_quote bar")).toBe(true);
    expect(isGmailQuoteClass("gmail_quote_container")).toBe(false);
    expect(isGmailQuoteClass("")).toBe(false);
  });
});

describe("isQuoteDividerText", () => {
  it("detects Gmail/Apple 'On … wrote:' attribution lines", () => {
    expect(
      isQuoteDividerText(
        "On Mon, Jan 1, 2020 at 3:00 PM, John Doe <john@x.com> wrote:",
      ),
    ).toBe(true);
  });

  it("detects Outlook 'Original Message' + forwarded dividers", () => {
    expect(isQuoteDividerText("-----Original Message-----")).toBe(true);
    expect(isQuoteDividerText("---------- Forwarded message ----------")).toBe(
      true,
    );
  });

  it("detects an Outlook From:/Sent: header block", () => {
    expect(
      isQuoteDividerText(
        "From: Jane <jane@x.com>\nSent: Tuesday\nTo: me\nSubject: Hi",
      ),
    ).toBe(true);
  });

  it("does not match ordinary body prose", () => {
    expect(isQuoteDividerText("Thanks, talk soon!")).toBe(false);
    expect(isQuoteDividerText("On the topic of lunch, I vote pizza.")).toBe(
      false,
    );
    expect(isQuoteDividerText("")).toBe(false);
  });
});
