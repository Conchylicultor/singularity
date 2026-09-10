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
// and does not know the kinds: it opens the Compare stage of the Prototypes
// app, which dispatches the declaration to whichever kind plugin handles it and
// lays both halves out at one shared width, and photographs the two boxes the
// stage publishes (`data-compare-half`). So a new counterpart kind is
// comparable the day it is contributed, and what sits beside the mock is the
// app as THIS deploy renders it — never a second rendering that could drift.
//
// --width picks one of the widths the stage offers for this counterpart (the
// prototype's own declared width by default). The run refuses, listing the
// choices, when the width is not one of them.
//
// --options picks the mock's variant (`theme=launch,palette=azure`) — the
// values its `<meta name="prototype-option">` lines declare. Without it the
// mock is photographed at its authored defaults, which for a page carrying
// several directions is only one of them. Picked through the stage's own
// options picker, so the capture shows exactly what a person would see; a name
// or value the page does not declare refuses the run instead of photographing
// the default.
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
  boot,
  colorReport,
  colorReportText,
  detectOsColorScheme,
  diffImages,
  heatmapText,
  numArg,
  pathUrl,
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
import { compareHalfSelector } from "@plugins/apps/plugins/prototypes/plugins/compare/core";

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

/** How much room the stage's chrome takes around the two halves. */
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

/** The width chips the stage offers: every radio labelled `<n>px`. */
async function offeredWidths(page: Page): Promise<number[]> {
  const names = await page
    .getByRole("radio")
    .evaluateAll((els) => els.map((el) => el.textContent?.trim() ?? ""));
  return names
    .filter((n) => /^\d+px$/.test(n))
    .map((n) => Number.parseInt(n, 10));
}

/** Resize the viewport so both halves sit side by side with no scrolling. */
async function fitViewport(page: Page, w: number): Promise<void> {
  await page.setViewportSize({
    width: 2 * w + CHROME.width,
    height: meta.viewport.h + CHROME.height,
  });
}

/** Every frame on the page has finished loading, then the settle pause. */
async function settle(page: Page): Promise<void> {
  await Promise.all(page.frames().map((f) => f.waitForLoadState("load")));
  await page.waitForTimeout(waitMs);
  // A frame attached during the pause (the app frame boots its own SPA) gets
  // its own load wait, so the capture is never of a half-painted document.
  await Promise.all(page.frames().map((f) => f.waitForLoadState("load")));
}

/** The frames showing this prototype's document (Focus's, or Compare's mock). */
function prototypeFrames(page: Page): Frame[] {
  return page
    .frames()
    .filter((f) => f.url().includes(`/api/prototypes/${name}/index.html`));
}

/** Each picked value, as the prototype document's `<html data-*>` carries it now. */
async function shownPicks(page: Page): Promise<Record<string, string | null>> {
  const [frame] = prototypeFrames(page);
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
 * Pick each `--options` value through the stage's options pill — hover reveals
 * one radio group per option — and wait for the prototype document to carry it.
 */
async function pickOptions(page: Page): Promise<void> {
  const entries = Object.entries(picks);
  if (entries.length === 0) return;
  const pill = page.getByLabel("Prototype options");
  for (const [option, value] of entries) {
    await pill.hover();
    const group = page.getByRole("radiogroup", { name: humanizeToken(option) });
    await group.waitFor({ state: "visible", timeout: 5000 });
    await group
      .getByRole("radio", { name: humanizeToken(value), exact: true })
      .click();
  }
  await page.mouse.move(0, 0);
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

  await boot(page, pathUrl(`/prototypes/proto/${name}`), {
    marker: "iframe",
    settleMs: 500,
  });
  await pickOptions(page);
  await page.getByRole("radio", { name: "Compare", exact: true }).click();
  // The stage opens zoomed to fit the pane; a capture wants actual size, so
  // a pixel of the mock is a pixel of the app.
  await page.getByRole("radio", { name: "100%", exact: true }).click();

  const mock = page.locator(compareHalfSelector("mock"));
  const counterpart = page.locator(compareHalfSelector("counterpart"));
  await mock.waitFor({ state: "visible", timeout: 20_000 });

  // The counterpart's status settles first: the width list is the
  // counterpart's own, so the chips are not final until it has resolved.
  await page
    .locator(
      `${compareHalfSelector("counterpart", "found")}, ${compareHalfSelector("counterpart", "unresolved")}`,
    )
    .first()
    .waitFor({ state: "attached", timeout: 30_000 });
  if (
    (await page
      .locator(compareHalfSelector("counterpart", "found"))
      .count()) === 0
  ) {
    const why = (await counterpart.innerText()).replace(/\s+/g, " ").trim();
    r.fail("counterpart resolves on this deploy", why);
    await r.finish();
  }

  if (width !== undefined) {
    const chip = page.getByRole("radio", { name: `${width}px`, exact: true });
    if ((await chip.count()) === 0) {
      const offered = await offeredWidths(page);
      r.fail(
        `stage offers ${width}px`,
        `this counterpart offers: ${offered.map((w) => `${w}px`).join(", ")} — pass one of them as --width`,
      );
      await r.finish();
    }
    await chip.click();
  }

  // The width the stage actually settled on, read off the box itself.
  const box = await mock.boundingBox();
  if (!box) throw new Error("the mock half has no box");
  const sharedWidth = Math.round(box.width);
  console.log(`width:        ${sharedWidth}px`);
  await fitViewport(page, sharedWidth);

  await settle(page);

  // The mock half must show the variant asked for — checked on the document
  // itself, since a capture of the default would diff just as happily.
  if (Object.keys(picks).length > 0) {
    const shown = await shownPicks(page);
    const off = Object.entries(picks).filter(([k, v]) => shown[k] !== v);
    if (off.length > 0) {
      r.fail(
        "the mock half shows the picked options",
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
    "both halves captured at the shared width",
    diff.a.width === sharedWidth && diff.b.width === sharedWidth,
    `mock ${diff.a.width}px, app ${diff.b.width}px, stage ${sharedWidth}px — a narrower capture means the half was clipped by the viewport`,
  );
  r.ok(
    "both halves have the same size",
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
