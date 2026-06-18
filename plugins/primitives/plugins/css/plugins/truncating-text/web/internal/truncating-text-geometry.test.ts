import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium, type Browser, type Page } from "playwright";

// jsdom returns zeros from getBoundingClientRect and cannot lay out text
// overflow, so the real proof drives a headless Chromium — same approach as
// frame-geometry.test.ts. We can't compile Tailwind here, so we inline the EXACT
// CSS each class expands to and render the leaf as a *node child of a plain block
// div* (the bug scenario: NOT a flex/grid item). The falsification case swaps the
// leaf to plain `inline` (the old behavior) and asserts it does NOT contain the
// text — proof the oracle bites on the regression it guards against.

// `inline-block max-w-full min-w-0 truncate` (what TruncatingText now emits).
const FIXED =
  "display:inline-block; max-width:100%; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;";
// The old leaf: a plain inline span carrying the same overflow declarations,
// which an inline box silently ignores.
const INLINE_NOOP =
  "display:inline; max-width:100%; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;";

const PARENT_W = 120; // px — narrower than the text below
const LONG = "a/very/long/file/path/that/should/ellipsize.tsx";
const ε = 0.5;

let browser: Browser;
let page: Page;

beforeAll(async () => {
  browser = await chromium.launch();
  page = await browser.newPage();
});

afterAll(async () => {
  await browser.close();
});

async function measure(leafStyle: string): Promise<{
  leafWidth: number;
  parentWidth: number;
  truncates: boolean;
}> {
  const html = `<!doctype html><html><head><style>
    * { margin: 0; padding: 0; box-sizing: border-box; font-family: monospace; font-size: 14px; }
    /* A plain BLOCK div — the context where inline truncation silently no-ops. */
    #parent { display: block; width: ${PARENT_W}px; }
    #leaf { ${leafStyle} }
  </style></head><body>
    <div id="parent"><span id="leaf">${LONG}</span></div>
  </body></html>`;
  await page.setContent(html);
  return page.evaluate(() => {
    const parent = document.getElementById("parent")!;
    const leaf = document.getElementById("leaf")!;
    return {
      leafWidth: leaf.getBoundingClientRect().width,
      parentWidth: parent.getBoundingClientRect().width,
      // scrollWidth>clientWidth is the standard "is this text clipped" check; it
      // only reads non-zero on a box that honors overflow (block/inline-block).
      truncates: leaf.scrollWidth > leaf.clientWidth,
    };
  });
}

describe("TruncatingText geometry (real Chromium layout)", () => {
  test("inline-block + max-w-full truncates inside a plain block parent", async () => {
    const m = await measure(FIXED);
    // The leaf is clamped to its container instead of overflowing…
    expect(m.leafWidth).toBeLessThanOrEqual(m.parentWidth + ε);
    // …and the clipped text is actually ellipsized.
    expect(m.truncates).toBe(true);
  });

  // FALSIFICATION: the old plain-inline span ignores overflow inside a block
  // parent, so the text lays out at full width and overflows the container. If
  // this DIDN'T overflow, the test above would be certifying nothing.
  test("falsification — plain inline span overflows (the original bug)", async () => {
    const m = await measure(INLINE_NOOP);
    // The inline box renders the whole string, exceeding the parent width.
    expect(m.leafWidth).toBeGreaterThan(m.parentWidth + ε);
  });
});
