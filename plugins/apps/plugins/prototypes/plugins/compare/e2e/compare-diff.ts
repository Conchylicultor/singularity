// Photographs a prototype mock beside the real app thing it declares it mocks,
// and diffs the two — so "does the app match the mockup?" comes back as a
// number, a heatmap and a picture instead of an eyeball.
//
// Usage:
//   ./singularity run plugins/apps/plugins/prototypes/plugins/compare/e2e/compare-diff.ts \
//     --name <proto-id> [--width <px>] [--options <name>=<value>,…] [--out <prefix>] [--threshold 0.1] \
//     [--delta-e 5] [--fail-above <pct>] [--wait <ms>] [--color-scheme dark|light] [--headed]
//
// The prototype names its counterpart itself, in its own
// `<meta name="mocks" content="<kind>:<ref>">` (`route:/agents`,
// `fixture:control-panel/setting-rail`). This script does not read that tag
// and does not know the kinds: it opens the prototype's canvas at
// `proto/<id>/compare` — frame A (the mock) beside the Real app frame, which
// dispatches the declaration to whichever kind plugin handles it — and
// photographs the two frame screens the canvas publishes
// (`data-canvas-frame="A"`, and the frame whose `data-canvas-frame-kind` is
// this plugin's source id). So a new counterpart kind is comparable the day it
// is contributed, and what sits beside the mock is the app as THIS deploy
// renders it — never a second rendering that could drift.
//
// Both frames always share one size (the canvas's), set to 100% through the
// size & zoom chip so a pixel of the mock is a pixel of the app. --width picks
// the canvas size preset of that width (the run refuses, listing the presets,
// when no preset has it). Without it the canvas stays Responsive and the
// browser window is sized so the frames come out at the prototype's own
// declared viewport — the size the mock was drawn at.
//
// --options picks the mock's variant (`theme=launch,palette=azure`) — the
// values its `<meta name="prototype-option">` lines declare. Without it the
// mock is photographed at its authored defaults (the run resets frame A's
// picks first), which for a page carrying several directions is only one of
// them. Picked through frame A's own options pill, so the capture shows exactly what a person would see; a
// name or value the page does not declare refuses the run instead of
// photographing the default. (Frame A's picks are the prototype's shared
// record; the harness reverts what the run wrote.)
//
// Writes `<out>-mock.png`, `<out>-app.png`, `<out>-diff.png` (the mock in
// faint grey, every differing pixel red) and `<out>-side-by-side.png` (all
// three under captions — the one image to open). Logs the differing-pixel
// ratio and a coarse per-cell heatmap.
//
// The pixel diff is salient by construction — a surface one shade off passes
// it — so colour gets its own report: the dominant colours of each half and
// how far apart the matching ones are (ΔE), the mean colour of each region,
// and the luminance profile across rows and columns (a gradient the app
// painted flat). Named colours in the transcript, and `<out>-colors.png` with
// the swatches, the two region mosaics and the profiles. `--delta-e` sets the
// drift line (default 5; ~2 is just noticeable).
//
// A transcript tool by default: pass --fail-above <pct> to make a
// differing-pixel ratio above it a FAIL.
//
// Example:
//   ./singularity run plugins/apps/plugins/prototypes/plugins/compare/e2e/compare-diff.ts \
//     --name proto-1786877040-3k6f --out /tmp/mist-panes

import { writeFileSync } from "node:fs";
import type { Frame, Locator, Page } from "playwright";
import {
  agentFetch,
  arg,
  colorReport,
  colorReportText,
  detectOsColorScheme,
  diffImages,
  heatmapText,
  numArg,
  report,
  requireArg,
  usage,
  withBrowser,
  type ColorScheme,
} from "@plugins/framework/plugins/tooling/plugins/e2e-harness/e2e";
import {
  humanizeToken,
  isPrototypeId,
  picksFromQuery,
  type OptionPicks,
  type PrototypeMeta,
} from "@plugins/apps/plugins/prototypes/plugins/files/core";
import {
  canvasFrameSelector,
  PROTOTYPE_FRAME_KIND,
  type CanvasFrameStatus,
} from "@plugins/apps/plugins/prototypes/plugins/canvas/core";
import {
  dismiss,
  frameDoc,
  openCanvas,
  openOptions,
  openSizeMenu,
  pickValue,
  screen,
} from "@plugins/apps/plugins/prototypes/plugins/canvas/e2e";
import { REAL_APP_SOURCE } from "@plugins/apps/plugins/prototypes/plugins/compare/core";

const USAGE =
  "--name <proto-id> is required — the prototype folder's minted id (`./singularity prototype list` prints them)";
const name = requireArg("name", USAGE);
if (!isPrototypeId(name)) {
  usage(
    `--name ${name} is not a prototype id (proto-<seconds>-<4 chars>); ${USAGE}`,
  );
}
const width = arg("width") === undefined ? undefined : numArg("width", 0);
const out = arg("out", "/tmp/prototype-compare");
const threshold = numArg("threshold", 0.1);
const failAbove =
  arg("fail-above") === undefined ? undefined : numArg("fail-above", 0);
const deltaE = numArg("delta-e", 5);
const waitMs = numArg("wait", 3000);
const colorScheme = (arg("color-scheme") ??
  detectOsColorScheme()) as ColorScheme;

/** Room around the two frames at a preset size: the app chrome and the board. */
const CHROME = { width: 720, height: 360 };

/**
 * The prototype's metadata, read the way the gallery reads it. Settled BEFORE
 * the browser launches: a prototype that mocks nothing has no counterpart half
 * to photograph, and that is a refusal to print, not a spinner to wait on.
 */
async function readMeta(): Promise<PrototypeMeta> {
  const res = await agentFetch("/api/prototypes");
  if (!res.ok) throw new Error(`GET /api/prototypes → ${res.status}`);
  const rows = (await res.json()) as PrototypeMeta[];
  const meta = rows.find((p) => p.name === name);
  if (!meta) {
    usage(
      `no prototype "${name}" on this deploy (${rows.length} listed — \`./singularity prototype list\`)`,
    );
  }
  return meta;
}

const meta = await readMeta();
const decl = meta.mocks;
if (decl.kind !== "declared") {
  usage(
    decl.kind === "none"
      ? `"${meta.title}" (${name}) declares no counterpart — nothing to compare it against.\n` +
          `  Add <meta name="mocks" content="<kind>:<ref>"> to its index.html; the Compare stage\n` +
          `  in the Prototypes app lists the kinds this worktree knows and an example of each.`
      : `"${meta.title}" (${name}) has a malformed mocks declaration: ${decl.raw} — ${decl.reason}`,
  );
}

/**
 * `--options theme=launch,palette=azure` → picks, judged against the options
 * the page declares by the same rule the server applies to a frame URL's query:
 * an undeclared name or value refuses the run rather than photographing the
 * default and calling it the variant.
 */
function readPicks(): OptionPicks {
  const raw = arg("options");
  if (raw === undefined) return {};
  const declared =
    meta.options.length === 0
      ? "it declares none"
      : meta.options
          .map((o) => `${o.name}: ${o.values.join(" | ")}`)
          .join("; ");
  const search = new URLSearchParams();
  for (const pair of raw.split(",")) {
    const [key, value, ...rest] = pair.split("=");
    if (!key || value === undefined || rest.length > 0) {
      usage(
        `--options expects <name>=<value>,… — got "${pair}" (${meta.title} ${declared})`,
      );
    }
    search.append(key.trim(), value.trim());
  }
  const result = picksFromQuery(meta.options, search);
  if (!result.ok) usage(`--options: ${result.reason}`);
  return result.picks;
}

const picks = readPicks();

console.log(`prototype:    ${meta.title} (${name})`);
console.log(`mocks:        ${decl.tag}:${decl.ref}`);
console.log(
  `options:      ${
    meta.options
      .map((o) => `${o.name}=${picks[o.name] ?? `${o.default} (default)`}`)
      .join(", ") || "none declared"
  }`,
);
console.log(`color-scheme: ${colorScheme}`);

/** The mock: frame A, the prototype. */
const mockSelector = (status?: CanvasFrameStatus) =>
  canvasFrameSelector({ letter: "A", kind: PROTOTYPE_FRAME_KIND, status });
/** The counterpart: the frame compare's Real app source contributes. */
const appSelector = (status?: CanvasFrameStatus) =>
  canvasFrameSelector({ kind: REAL_APP_SOURCE, status });

/** A size preset as the size & zoom menu lists it: `Phone  480 × 900`. */
interface Preset {
  name: string;
  w: number;
  h: number;
}

/** Every preset the size & zoom menu offers, read off its radio rows. */
async function offeredPresets(page: Page): Promise<Preset[]> {
  await openSizeMenu(page);
  const rows = await page
    .getByRole("radio")
    .evaluateAll((els) => els.map((el) => el.textContent ?? ""));
  await dismiss(page);
  return rows.flatMap((text) => {
    const m = /^\s*([A-Za-z]+)\s*(\d+)\s*×\s*(\d+)/.exec(text);
    return m && m[1] !== "Custom"
      ? [{ name: m[1]!, w: Number(m[2]), h: Number(m[3]) }]
      : [];
  });
}

/** Pick a size row by name, and set the zoom to 100%. */
async function pickSizeAtActual(
  page: Page,
  preset: string | null,
): Promise<void> {
  await openSizeMenu(page);
  if (preset !== null) {
    await page.getByRole("radio", { name: new RegExp(`^${preset}`) }).click();
  }
  await page.getByRole("button", { name: "Actual size" }).click();
  await dismiss(page);
}

/** Frame A's logical page size (its iframe's own box). */
async function mockSize(page: Page): Promise<{ w: number; h: number }> {
  const doc = await frameDoc(page, meta, "A");
  if (!doc) throw new Error("frame A has no document");
  return { w: doc.width, h: doc.height };
}

/**
 * Responsive at 100%: each frame IS its share of the canvas, in page pixels.
 * Grow or shrink the window by twice the difference (two frames share the
 * width) until the frames come out at `want` — the chrome around them is
 * measured, never assumed.
 */
async function sizeWindowTo(
  page: Page,
  want: { w: number; h: number },
): Promise<void> {
  for (let i = 0; i < 4; i++) {
    const got = await mockSize(page);
    if (got.w === want.w && got.h === want.h) return;
    const vp = page.viewportSize();
    if (!vp) throw new Error("no viewport");
    await page.setViewportSize({
      width: vp.width + 2 * (want.w - got.w),
      height: vp.height + (want.h - got.h),
    });
    await page.waitForTimeout(300);
  }
}

/** Every frame on the page has finished loading, then the settle pause. */
async function settle(page: Page): Promise<void> {
  await Promise.all(page.frames().map((f) => f.waitForLoadState("load")));
  await page.waitForTimeout(waitMs);
  // A frame attached during the pause (the app frame boots its own SPA) gets
  // its own load wait, so the capture is never of a half-painted document.
  await Promise.all(page.frames().map((f) => f.waitForLoadState("load")));
}

/** Each option's value, as frame A's document `<html data-*>` carries it now. */
async function shownPicks(page: Page): Promise<Record<string, string | null>> {
  const handle = await screen(page, "A")
    .locator("iframe:not([aria-hidden])")
    .elementHandle();
  const frame: Frame | null = handle ? await handle.contentFrame() : null;
  if (!frame) return {};
  return frame.evaluate(
    (keys) =>
      Object.fromEntries(
        keys.map((k) => [
          k,
          document.documentElement.getAttribute(`data-${k}`),
        ]),
      ),
    Object.keys(picks),
  );
}

/**
 * Put frame A on its authored defaults, then pick each `--options` value
 * through its options pill — one radio group per option.
 */
async function pickOptions(page: Page): Promise<void> {
  if (meta.options.length === 0) return;
  const popover = await openOptions(page, "A");
  const reset = popover.getByRole("button", { name: "Reset to defaults" });
  if ((await reset.count()) > 0) await reset.click();
  for (const [option, value] of Object.entries(picks)) {
    await pickValue(popover, humanizeToken(option), humanizeToken(value));
  }
  await dismiss(page);
}

async function capture(loc: Locator, suffix: string): Promise<Buffer> {
  const png = await loc.screenshot({ timeout: 15_000 });
  const path = `${out}-${suffix}.png`;
  writeFileSync(path, png);
  console.log(`wrote ${path}`);
  return png;
}

await withBrowser(async (h) => {
  const r = report(`compare-diff — ${meta.title}`);
  const { page, captured } = await h.session({
    viewport: {
      width: 2 * (width ?? meta.viewport.w) + CHROME.width,
      height: meta.viewport.h + CHROME.height,
    },
    colorScheme,
  });

  await openCanvas(page, name, "compare");
  const mock = page.locator(mockSelector());
  const counterpart = page.locator(appSelector());

  // The Real app frame joins once compare's plugin has loaded, then resolves.
  await page
    .locator(`${appSelector("found")}, ${appSelector("unresolved")}`)
    .first()
    .waitFor({ state: "attached", timeout: 30_000 });
  if ((await page.locator(appSelector("found")).count()) === 0) {
    const why = (await counterpart.innerText()).replace(/\s+/g, " ").trim();
    r.fail("counterpart resolves on this deploy", why);
    await r.finish();
  }

  await pickOptions(page);

  // One size for both frames, at 100%: a preset for --width, else Responsive
  // with the window sized so the frames come out at the declared viewport.
  if (width !== undefined) {
    const presets = await offeredPresets(page);
    const preset = presets.find((p) => p.w === width);
    if (!preset) {
      r.fail(
        `a canvas size preset is ${width}px wide`,
        `the presets are ${presets.map((p) => `${p.name} ${p.w}×${p.h}`).join(", ")} — pass one of their widths as --width, or omit it for the prototype's declared ${meta.viewport.w}×${meta.viewport.h}`,
      );
      return await r.finish();
    }
    await pickSizeAtActual(page, preset.name);
    await page.setViewportSize({
      width: 2 * preset.w + CHROME.width,
      height: preset.h + CHROME.height,
    });
  } else {
    await pickSizeAtActual(page, null);
    await sizeWindowTo(page, meta.viewport);
  }

  await page.locator(mockSelector("found")).waitFor({ timeout: 20_000 });
  await page.mouse.move(0, 0);
  await settle(page);

  // The size the canvas actually settled on, read off frame A's document.
  const size = await mockSize(page);
  console.log(`size:         ${size.w}×${size.h}`);

  // The mock must show the variant asked for — checked on the document
  // itself, since a capture of the default would diff just as happily.
  if (Object.keys(picks).length > 0) {
    const shown = await shownPicks(page);
    const off = Object.entries(picks).filter(([k, v]) => shown[k] !== v);
    if (off.length > 0) {
      r.fail(
        "the mock shows the picked options",
        off
          .map(([k, v]) => `data-${k}=${String(shown[k])}, wanted ${v}`)
          .join("; "),
      );
      await r.finish();
    }
  }

  const mockPng = await capture(mock, "mock");
  const appPng = await capture(counterpart, "app");

  const diff = await diffImages(page, mockPng, appPng, {
    threshold,
    labels: [`mock — ${meta.title}`, `app — ${decl.tag}:${decl.ref}`],
  });
  writeFileSync(`${out}-diff.png`, diff.diffPng);
  console.log(`wrote ${out}-diff.png`);
  writeFileSync(`${out}-side-by-side.png`, diff.sideBySidePng);
  console.log(`wrote ${out}-side-by-side.png`);

  const pct = (diff.ratio * 100).toFixed(2);
  console.log(
    `sizes:        mock ${diff.a.width}×${diff.a.height}, app ${diff.b.width}×${diff.b.height}`,
  );
  console.log(
    `mismatch:     ${pct}% of ${diff.total} pixels differ (threshold ${threshold})`,
  );
  console.log(`heatmap (% differing per cell, top-left → bottom-right):`);
  console.log(heatmapText(diff.grid));

  // The colour report: the pixel diff is salient by construction (a surface a
  // shade off passes it), so the palette, region means and tone profiles are
  // reported separately, with the colours named.
  const colors = await colorReport(page, mockPng, appPng, {
    deltaE,
    labels: ["mock", "app"],
  });
  writeFileSync(`${out}-colors.png`, colors.sheetPng);
  console.log(`wrote ${out}-colors.png`);
  console.log(
    `colour report (ΔE ${deltaE} = drifting; ~2 is just noticeable):`,
  );
  console.log(colorReportText(colors));

  r.ok(
    "both frames captured at the canvas size",
    diff.a.width === size.w && diff.b.width === size.w,
    `mock ${diff.a.width}px, app ${diff.b.width}px, canvas ${size.w}px — a narrower capture means the frame was clipped by the window`,
  );
  r.ok(
    "both frames have the same size",
    diff.sameSize,
    `mock ${diff.a.width}×${diff.a.height} vs app ${diff.b.width}×${diff.b.height}; compared the top-left ${diff.compared.width}×${diff.compared.height}`,
  );
  if (failAbove !== undefined) {
    r.ok(
      `mismatch is at most ${failAbove}%`,
      diff.ratio * 100 <= failAbove,
      `${pct}% differs`,
    );
  }
  // A variant nobody picked was photographed at its default — say so beside
  // the verdict, where a reader of the number will see it.
  const unpicked = meta.options.filter((o) => !(o.name in picks));
  if (unpicked.length > 0) {
    r.note(
      `mock captured at its default ${unpicked
        .map((o) => `${o.name}=${o.default}`)
        .join(", ")} — pass --options to compare another variant (${unpicked
        .map((o) => `${o.name}: ${o.values.join(" | ")}`)
        .join("; ")})`,
    );
  }
  // The prototype runs its own scripts; an error there is worth knowing but is
  // not a verdict on the comparison.
  for (const err of captured.pageErrors) r.note(`page error: ${err}`);
  await r.finish();
});
