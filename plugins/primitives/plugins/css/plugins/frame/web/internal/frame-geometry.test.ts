import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium, type Browser, type Page } from "playwright";
import { frameGridTemplate } from "./frame";

// jsdom returns zeros from getBoundingClientRect and cannot lay out CSS grid, so
// the geometry proof drives a real headless Chromium. We import the EXACT track
// function the component uses (`frameGridTemplate`) and reconstruct the DOM
// `Frame` emits — fixed-width rigid spans for leading/trailing, a min-w-0
// truncating text run for content, an optional text run for meta — so the
// measured layout is faithful without compiling Tailwind (auto/minmax/1fr/
// max-content are native CSS, and the wrappers' min-width/overflow are inlined).
//
// THE LOAD-BEARING METRIC IS TRUNCATION ONSET, NOT TRACK WIDTH. A flex-slot
// `<div>` always stretches to fill its grid track, so measuring track widths only
// reports track ALLOCATION — it can never prove which slot's TEXT actually
// ellipsizes. The real contract ("meta truncates first, content truncates last")
// is observable only via `scrollWidth > clientWidth` (the standard "is this text
// clipped" check) per slot. The shrink-priority test below sweeps container
// widths and compares the WIDTH AT WHICH each slot first enters the truncating
// state — that is the genuine oracle, and it fails on the wrong templates (see
// the falsification cases at the bottom).

const LEADING_W = 40; // rigid cluster natural width (px)
const TRAILING_W = 28;

// Geometry-invariant matrix inputs (overlap / clip / rigid checks only — these
// hold regardless of fit).
const SHORT = "ok";
const LONG =
  "a very long primary content label that must ellipsize before metadata is touched";
const META = "· 1234ms";
const ε = 0.5;

// Truncation-onset inputs: realistic DISTINCT lengths — a medium content label
// and a long-ish meta path — both of which FIT at the widest sampled width, so
// the "neither truncates when roomy" precondition is real and the priority is
// genuinely exercised (not a content string so long it can never fit).
const CONTENT_LABEL = "Refactor the frame primitive layout";
const META_PATH = "src/primitives/css/frame/web/internal/frame.tsx";

type Cell = {
  contentLen: "short" | "long";
  withMeta: boolean;
  width: number;
};

const WIDTHS = { narrow: 240, wide: 720 } as const;

const CELLS: Cell[] = [];
for (const contentLen of ["short", "long"] as const) {
  for (const withMeta of [true, false]) {
    for (const width of [WIDTHS.narrow, WIDTHS.wide]) {
      CELLS.push({ contentLen, withMeta, width });
    }
  }
}

type Box = { left: number; right: number; width: number };
type Measured = {
  container: Box;
  leading: Box;
  content: Box;
  meta: Box | null;
  trailing: Box;
};

let browser: Browser;
let page: Page;

beforeAll(async () => {
  browser = await chromium.launch();
  page = await browser.newPage();
});

afterAll(async () => {
  await browser.close();
});

/**
 * Render a real grid via `frameGridTemplate`, with arbitrary content/meta text
 * and a forced template override (used by the falsification cases to prove the
 * test bites on the wrong track functions). When `templateOverride` is omitted,
 * the component's real `frameGridTemplate` output is used.
 */
async function setFrame(opts: {
  contentText: string;
  metaText: string | null;
  width: number;
  templateOverride?: string;
}) {
  const present = {
    leading: true,
    content: true,
    meta: opts.metaText != null,
    trailing: true,
  };
  const template = opts.templateOverride ?? frameGridTemplate(present);

  const html = `<!doctype html><html><head><style>
    * { margin: 0; padding: 0; box-sizing: border-box; font-family: monospace; font-size: 14px; }
    #frame {
      display: grid;
      grid-template-columns: ${template};
      column-gap: 8px;
      align-items: center;
      justify-content: start;
      width: ${opts.width}px;
    }
    /* rigid clusters: auto track sized to fixed-width content, never crushed */
    #leading { width: ${LEADING_W}px; }
    #trailing { width: ${TRAILING_W}px; }
    /* flexible tracks: min-w-0 + truncate, mirroring TruncatingText / FlexSlot */
    .flex-slot { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  </style></head><body>
    <div id="frame">
      <div id="leading"></div>
      <div id="content" class="flex-slot">${opts.contentText}</div>
      ${
        opts.metaText != null
          ? `<div id="meta" class="flex-slot">${opts.metaText}</div>`
          : // No meta ⇒ an inert 1fr spacer takes its slot (mirrors the component),
            // so leftover width never pools into the rigid auto clusters.
            `<div id="spacer" style="min-width:0"></div>`
      }
      <div id="trailing"></div>
    </div>
  </body></html>`;

  await page.setContent(html);
}

async function measure(cell: Cell): Promise<Measured> {
  await setFrame({
    contentText: cell.contentLen === "long" ? LONG : SHORT,
    metaText: cell.withMeta ? META : null,
    width: cell.width,
  });
  return page.evaluate(() => {
    const rect = (
      id: string,
    ): { left: number; right: number; width: number } | null => {
      const el = document.getElementById(id);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { left: r.left, right: r.right, width: r.width };
    };
    return {
      container: rect("frame")!,
      leading: rect("leading")!,
      content: rect("content")!,
      meta: rect("meta"),
      trailing: rect("trailing")!,
    };
  });
}

/** Read whether the content / meta text runs are currently ellipsized. */
async function readTruncation(): Promise<{ content: boolean; meta: boolean }> {
  return page.evaluate(() => {
    const trunc = (id: string): boolean => {
      const el = document.getElementById(id);
      return el ? el.scrollWidth > el.clientWidth : false;
    };
    return { content: trunc("content"), meta: trunc("meta") };
  });
}

/**
 * Sweep container widths wide→narrow and return the WIDEST width at which each
 * slot first enters the truncating state (-1 if it never truncates over the
 * sweep). A larger threshold means "truncates earlier as the row narrows".
 */
async function truncationThresholds(templateOverride?: string): Promise<{
  contentAt: number;
  metaAt: number;
  roomyTruncates: { content: boolean; meta: boolean };
  everClips: boolean;
}> {
  let contentAt = -1;
  let metaAt = -1;
  let everClips = false;
  const widest = 900;
  // Floor the sweep at the row's irreducible rigid minimum (leading + trailing +
  // the three column-gaps). Below it ANY template overflows by definition — the
  // container is simply narrower than the un-shrinkable clusters — so measuring
  // "clips" there tests the harness's chosen widths, not the track function. The
  // floor still sits far below content's truncation threshold, so the strict
  // priority is fully exercised on the way down.
  const RIGID_FLOOR = LEADING_W + TRAILING_W + 3 * 8 + 20; // +20px headroom
  let roomy = { content: false, meta: false };
  for (let w = widest; w >= RIGID_FLOOR; w -= 5) {
    await setFrame({
      contentText: CONTENT_LABEL,
      metaText: META_PATH,
      width: w,
      templateOverride,
    });
    const t = await readTruncation();
    if (w === widest) roomy = t;
    if (t.content && contentAt < 0) contentAt = w;
    if (t.meta && metaAt < 0) metaAt = w;
    const clip = await page.evaluate(() => {
      const f = document.getElementById("frame")!.getBoundingClientRect();
      for (const id of ["leading", "content", "meta", "trailing"]) {
        const el = document.getElementById(id);
        if (!el) continue;
        const r = el.getBoundingClientRect();
        if (r.right > f.right + 0.5 || r.left < f.left - 0.5) return true;
      }
      return false;
    });
    if (clip) everClips = true;
  }
  return { contentAt, metaAt, roomyTruncates: roomy, everClips };
}

describe("Frame geometry (real Chromium grid layout)", () => {
  for (const cell of CELLS) {
    const name = `${cell.contentLen} content × ${
      cell.withMeta ? "with" : "without"
    } meta × ${cell.width}px`;

    test(name, async () => {
      const m = await measure(cell);

      // Ordered slots present in this cell (left → right).
      const ordered: Box[] = [
        m.leading,
        m.content,
        ...(m.meta ? [m.meta] : []),
        m.trailing,
      ];

      // 1. No overlap: adjacent slots don't collide.
      for (let i = 0; i < ordered.length - 1; i++) {
        const cur = ordered[i]!;
        const next = ordered[i + 1]!;
        expect(cur.right).toBeLessThanOrEqual(next.left + ε);
      }

      // 2. No clip past container: every slot stays inside the container box.
      for (const b of ordered) {
        expect(b.left).toBeGreaterThanOrEqual(m.container.left - ε);
        expect(b.right).toBeLessThanOrEqual(m.container.right + ε);
      }

      // 3. Rigid integrity: leading/trailing keep their natural width always.
      expect(m.leading.width).toBeCloseTo(LEADING_W, 0);
      expect(m.trailing.width).toBeCloseTo(TRAILING_W, 0);

      // 4. Content is left-packed immediately after leading (one column-gap, no
      //    extra slack). The no-meta regression centered content by pooling
      //    leftover into the rigid auto tracks — this asserts it doesn't.
      expect(m.content.left).toBeCloseTo(m.leading.right + 8, 0);

      // 5. Trailing stays pinned to the right edge (the flexible fill track, meta
      //    or spacer, absorbs all leftover between content and trailing).
      expect(m.trailing.right).toBeCloseTo(m.container.right, 0);
    });
  }

  // THE load-bearing assertion: strict priority proven by TRUNCATION ONSET.
  // Sweeps container widths and compares the width at which each slot first
  // ellipsizes. Strict priority means meta must reach the truncating state at a
  // WIDER container width than content does (meta starts giving up characters
  // earlier), and content must not truncate until meta has been exhausted.
  test("strict priority: meta truncates before content (truncation onset)", async () => {
    const t = await truncationThresholds();

    // When roomy (widest sampled width), NEITHER slot truncates.
    expect(t.roomyTruncates.content).toBe(false);
    expect(t.roomyTruncates.meta).toBe(false);

    // Both eventually truncate as the row narrows (sweep reaches them).
    expect(t.metaAt).toBeGreaterThan(0);
    expect(t.contentAt).toBeGreaterThan(0);

    // Meta enters the truncating state at a WIDER container width than content —
    // i.e. meta truncates first, content last. THIS is the strict-priority oracle.
    expect(t.metaAt).toBeGreaterThan(t.contentAt);

    // Nothing ever clips/overflows the container across the whole sweep.
    expect(t.everClips).toBe(false);
  });

  // FALSIFICATION: the strict-priority test above MUST fail on the wrong track
  // functions, otherwise it certifies nothing. We feed the rejected templates as
  // overrides and assert the priority is NOT satisfied (meta does not truncate
  // strictly before content). This is the proof the oracle has teeth.
  test("falsification — weighted 3fr/1fr does NOT satisfy strict priority", async () => {
    const t = await truncationThresholds(
      "auto minmax(0,3fr) minmax(0,1fr) auto",
    );
    // The old weighted split shares space proportionally: meta is starved and
    // truncates even when the row is roomy, so the "neither truncates when roomy"
    // precondition is violated — it cannot pass the strict-priority test.
    const strictPriorityHolds =
      !t.roomyTruncates.content &&
      !t.roomyTruncates.meta &&
      t.metaAt > 0 &&
      t.contentAt > 0 &&
      t.metaAt > t.contentAt &&
      !t.everClips;
    expect(strictPriorityHolds).toBe(false);
  });

  test("falsification — naive content:1fr meta:auto INVERTS the priority", async () => {
    const t = await truncationThresholds("auto minmax(0,1fr) auto auto");
    // meta:auto is rigid, so content (the lone flexible track) truncates FIRST:
    // contentAt > metaAt. Strict priority (metaAt > contentAt) does not hold.
    const strictPriorityHolds = t.metaAt > t.contentAt;
    expect(strictPriorityHolds).toBe(false);
  });
});
