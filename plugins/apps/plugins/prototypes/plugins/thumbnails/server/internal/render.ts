import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { Browser } from "playwright";
import { createSemaphore } from "@plugins/packages/plugins/semaphore/core";
import { ensureChromium } from "@plugins/infra/plugins/safe-fetch/plugins/browser-fetch/core";
import { PROTOTYPES_DIR } from "@plugins/apps/plugins/prototypes/plugins/files/server";
import type { PrototypeMeta } from "@plugins/apps/plugins/prototypes/plugins/files/core";
import { classifyRenderOutcome } from "./decide";
import { ThumbnailRenderError } from "./errors";

/** Bound on one `chromium.launch()`. */
const LAUNCH_TIMEOUT_MS = 30_000;
/** Bound on reaching `load` for the prototype's own document. */
const NAV_TIMEOUT_MS = 20_000;
/** Ceiling on waiting for the network to go quiet. NOT a failure — see below. */
const SETTLE_TIMEOUT_MS = 3_000;
/** How long the page gets to paint something before we call it blank. */
const CONTENT_TIMEOUT_MS = 5_000;
/** Bound on Playwright's own module evaluation (~3 s cold on this box). */
const MODULE_TIMEOUT_MS = 30_000;

/**
 * Render at half density: a 1280×800 prototype yields a 640×400 PNG. The
 * viewport stays at the prototype's declared CSS size (so its media queries see
 * what their author intended) and only the raster density drops — which is how
 * a card-sized image comes out of this with no image-resizing dependency.
 */
const DEVICE_SCALE_FACTOR = 0.5;

/**
 * Resource types whose failure invalidates the picture. A prototype loads React
 * and Babel from a CDN, so an offline machine renders a real page that shows
 * none of the prototype — the exact false-success that must never be cached. A
 * failed image or font is not in this set: the layout it belongs to still
 * rendered.
 */
const CRITICAL_RESOURCE_TYPES = new Set(["document", "script", "stylesheet"]);

/**
 * True when the page has painted something: any text, or any of the elements a
 * purely graphical prototype would draw into.
 *
 * A string, not a function, deliberately — it is evaluated in the browser, and
 * writing it as a string keeps DOM globals out of this server-side module.
 */
const HAS_CONTENT_EXPR = `(() => {
  const body = document.body;
  if (!body) return false;
  if ((body.innerText || "").trim().length > 0) return true;
  return body.querySelector("canvas, svg, img, video") !== null;
})()`;

/**
 * One browser at a time in this backend. Chromium's launch + render saturates
 * roughly a core, and a gallery open can ask for several prototypes at once.
 *
 * Known limit: this bounds the backend, not the host — `browser-fetch` reserves
 * a host-wide slot pool for its own launches, and this does not share it. That
 * is acceptable while prototype renders are rare and short (a handful of mocks,
 * a couple of seconds each); if agents start opening galleries concurrently
 * across many worktrees, the fix is a `RESERVED_POOLS` entry in
 * `host-admission/core`, not a bigger number here.
 */
const renderGate = createSemaphore(1);

type PlaywrightModule = typeof import("playwright");
let playwrightModule: Promise<PlaywrightModule> | undefined;

/**
 * Load Playwright lazily and once. Importing it costs seconds of module
 * evaluation, which a backend must never pay at boot merely because something
 * in its graph *can* start a browser — the same care `browser-fetch` takes.
 */
async function loadPlaywright(): Promise<PlaywrightModule> {
  const pending = (playwrightModule ??= import("playwright"));
  return withTimeout(
    pending,
    MODULE_TIMEOUT_MS,
    () =>
      new ThumbnailRenderError(
        "browser-unavailable",
        `playwright did not load within ${MODULE_TIMEOUT_MS}ms`,
      ),
  );
}

/** Bound a promise that has no timeout option of its own. */
async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  onTimeout: () => Error,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(onTimeout()), ms);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/** Playwright signals every one of its own budget breaches this way. */
function isTimeout(err: unknown): boolean {
  return err instanceof Error && err.name === "TimeoutError";
}

/**
 * Render one prototype to a PNG.
 *
 * Throws — with a classified `kind` — rather than ever returning a picture it
 * does not trust. The caller turns that into a visible `failed` state on the
 * card; nothing is written to the cache.
 */
export async function renderThumbnail(
  meta: PrototypeMeta,
): Promise<Uint8Array> {
  await ensureChromium();
  const { chromium } = await loadPlaywright();

  return renderGate.run(async () => {
    let browser: Browser | undefined;
    try {
      browser = await chromium.launch({
        // The non-SSRF subset of browser-fetch's argv: no telemetry, no
        // variations, no component updates — none of which a local file needs,
        // and each of which is startup latency. The sandbox stays ON: a
        // prototype is arbitrary third-party JS running in the user's account.
        args: [
          "--disable-background-networking",
          "--no-first-run",
          "--disable-sync",
          "--disable-component-update",
          "--js-flags=--max-old-space-size=512",
        ],
        timeout: LAUNCH_TIMEOUT_MS,
      });
    } catch (err) {
      throw new ThumbnailRenderError(
        "browser-unavailable",
        `could not launch chromium: ${String(err)}`,
        { cause: err },
      );
    }

    try {
      const context = await browser.newContext({
        viewport: { width: meta.viewport.w, height: meta.viewport.h },
        deviceScaleFactor: DEVICE_SCALE_FACTOR,
        serviceWorkers: "block",
        acceptDownloads: false,
      });
      const page = await context.newPage();

      const failedCritical: string[] = [];
      page.on("requestfailed", (request) => {
        if (!CRITICAL_RESOURCE_TYPES.has(request.resourceType())) return;
        const reason = request.failure()?.errorText ?? "unknown error";
        failedCritical.push(`${request.url()} (${reason})`);
      });

      // `file://`, not the HTTP route: a prototype renders off disk by
      // contract, so this needs no gateway, no socket, and no server round-trip
      // — and it is the same path a human gets by double-clicking the file.
      const url = pathToFileURL(
        join(PROTOTYPES_DIR, meta.name, "index.html"),
      ).href;

      try {
        await page.goto(url, { waitUntil: "load", timeout: NAV_TIMEOUT_MS });
      } catch (err) {
        if (!isTimeout(err)) throw err;
        throw new ThumbnailRenderError(
          "render-timeout",
          `${meta.name} did not finish loading within ${NAV_TIMEOUT_MS}ms`,
          { cause: err },
        );
      }

      // The settle ceiling is the EXPECTED path, not a failure: a page holding
      // an open connection never goes idle, and it has still rendered.
      try {
        await page.waitForLoadState("networkidle", {
          timeout: SETTLE_TIMEOUT_MS,
        });
      } catch (err) {
        if (!isTimeout(err)) throw err;
      }

      // Waiting for content and detecting a blank page are the same act: this
      // gives an in-browser Babel compile time to produce a first paint, and
      // its timeout IS the blankness verdict.
      let painted = true;
      try {
        await page.waitForFunction(HAS_CONTENT_EXPR, undefined, {
          timeout: CONTENT_TIMEOUT_MS,
        });
      } catch (err) {
        if (!isTimeout(err)) throw err;
        painted = false;
      }

      const rejection = classifyRenderOutcome(
        meta.name,
        failedCritical,
        painted,
      );
      if (rejection) throw rejection;

      const png = await page.screenshot({ type: "png" });
      return new Uint8Array(png);
    } finally {
      await browser.close();
    }
  });
}
