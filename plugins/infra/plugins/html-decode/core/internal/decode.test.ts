import { describe, expect, test } from "bun:test";
import { decodeHtmlText, readHtmlAttr } from "./decode";

/** Stand-in for an HTMLRewriter element handler's element. */
function element(attrs: Record<string, string>) {
  return {
    getAttribute(name: string): string | null {
      return attrs[name] ?? null;
    },
  };
}

describe("decodeHtmlText", () => {
  test("decodes named references", () => {
    expect(decodeHtmlText("tag &amp; amp &lt;b&gt; &quot;q&quot; &nbsp;end")).toBe(
      'tag & amp <b> "q"  end',
    );
  });

  test("decodes decimal and hex numeric references", () => {
    expect(decodeHtmlText("d&#x27;entretien")).toBe("d'entretien");
    expect(decodeHtmlText("d&#39;entretien")).toBe("d'entretien");
    expect(decodeHtmlText("r&#xe9;ponses")).toBe("réponses");
    expect(decodeHtmlText("r&#233;ponses")).toBe("réponses");
  });

  test("decodes an &amp;-bearing URL into the intended query string", () => {
    expect(decodeHtmlText("https://x.test/?a=1&amp;b=2")).toBe(
      "https://x.test/?a=1&b=2",
    );
  });

  test("decodes ONCE — &amp;#x27; is a literal &#x27;, not an apostrophe", () => {
    expect(decodeHtmlText("&amp;#x27;")).toBe("&#x27;");
  });

  test("leaves plain text and the empty string untouched", () => {
    expect(decodeHtmlText("")).toBe("");
    expect(decodeHtmlText("nothing to decode")).toBe("nothing to decode");
  });
});

describe("readHtmlAttr", () => {
  test("decodes a present attribute", () => {
    const el = element({ content: "single &#x27;quote&#39; &amp; amp" });
    expect(readHtmlAttr(el, "content")).toBe("single 'quote' & amp");
  });

  test("returns undefined for an absent attribute", () => {
    expect(readHtmlAttr(element({ content: "x" }), "property")).toBeUndefined();
  });

  test("distinguishes an empty-valued attribute from an absent one", () => {
    expect(readHtmlAttr(element({ content: "" }), "content")).toBe("");
  });
});
