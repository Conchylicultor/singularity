import { describe, expect, test } from "bun:test";
import { pageMetaHeader, splitPageMeta, type PageMeta } from "./page-meta";

const META: PageMeta = {
  created: new Date("2026-07-14T09:12:34.567Z"),
  edited: new Date("2026-10-07T18:02:59Z"),
  breadcrumb: [
    { id: "block-root", title: "Singularity" },
    { id: "block-mid", title: 'Say "hi" \\ <now>' },
    { id: "block-self", title: "" },
  ],
};

const DOC =
  '# Hosted\n\nGoal: sync.\n<agent-inline id="block-1">\nnote\n</agent-inline>';

describe("pageMetaHeader", () => {
  test("states the breadcrumb root first and the times to the minute, UTC", () => {
    expect(pageMetaHeader(META)).toBe(
      [
        '<page-meta created="2026-07-14T09:12Z" edited="2026-10-07T18:02Z">',
        "  <breadcrumb>",
        '    <page id="block-root" title="Singularity"/>',
        '    <page id="block-mid" title="Say \\"hi\\" \\\\ <now>"/>',
        '    <page id="block-self" title=""/>',
        "  </breadcrumb>",
        "</page-meta>",
        "",
        "",
      ].join("\n"),
    );
  });
});

describe("splitPageMeta", () => {
  test("header + document splits back to exactly the document", () => {
    const split = splitPageMeta(pageMetaHeader(META) + DOC);
    expect(split.ok).toBe(true);
    if (!split.ok) return;
    expect(split.rest).toBe(DOC);
    expect(split.meta?.attrs).toEqual({
      created: "2026-07-14T09:12Z",
      edited: "2026-10-07T18:02Z",
    });
    // Titles come back unescaped: the header and the blocks share one attribute
    // quoting.
    expect(split.meta?.breadcrumb).toEqual(
      META.breadcrumb.map((c) => ({ ...c })),
    );
  });

  test("a document with no header is returned whole", () => {
    expect(splitPageMeta(DOC)).toEqual({
      ok: true,
      meta: null,
      header: "",
      rest: DOC,
    });
  });

  test("changed values are still a header — they are read-only, not judged", () => {
    const edited = pageMetaHeader(META)
      .replace("2026-10-07T18:02Z", "1999-01-01T00:00Z")
      .replace('title="Singularity"', 'title="Renamed"');
    const split = splitPageMeta(edited + DOC);
    expect(split.ok && split.rest).toBe(DOC);
  });

  test("re-indented header lines are accepted", () => {
    const flat = pageMetaHeader(META)
      .split("\n")
      .map((l) => l.trim())
      .join("\n");
    const split = splitPageMeta(flat + DOC);
    expect(split.ok && split.rest).toBe(DOC);
  });

  test("a paragraph opening with an escaped < is not a header", () => {
    const doc = "\\<page-meta> is literal text";
    expect(splitPageMeta(doc)).toMatchObject({
      ok: true,
      meta: null,
      rest: doc,
    });
  });

  test("content written inside the header is refused, not dropped", () => {
    const header = pageMetaHeader(META).replace(
      "</page-meta>",
      "A new paragraph.\n</page-meta>",
    );
    const split = splitPageMeta(header + DOC);
    expect(split.ok).toBe(false);
    if (split.ok) return;
    expect(split.reason).toContain('"A new paragraph."');
  });

  test("a header with no closing tag is refused", () => {
    const header = pageMetaHeader(META).replace("</page-meta>\n", "");
    const split = splitPageMeta(header + DOC);
    expect(split.ok).toBe(false);
    if (split.ok) return;
    expect(split.reason).toContain("no closing </page-meta>");
  });

  test("a crumb outside the breadcrumb is refused", () => {
    const doc =
      '<page-meta created="x" edited="y">\n<page id="a" title="b"/>\n</page-meta>\n\n' +
      DOC;
    expect(splitPageMeta(doc).ok).toBe(false);
  });
});
