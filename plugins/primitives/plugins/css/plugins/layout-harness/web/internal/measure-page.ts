import { join, normalize } from "node:path";
import { chromium, type Browser, type Page } from "playwright";
import type {
  FixtureMutation,
  MeasuredFixture,
} from "@plugins/primitives/plugins/css/plugins/layout-harness/core";

// The browser-side globals the measurer page (`entry.tsx`) installs on `window`
// and this driver reads. Declared in this module (not a bare ambient `.d.ts`) so
// the augmentation travels with the import graph — it is therefore present in
// BOTH the web tsconfig program (which includes `entry.tsx` + this file) AND the
// test tsconfig program (which only sees this file transitively via the suite).
declare global {
  interface Window {
    /** True once `loadFixtures()` resolved and the globals below are installed. */
    __fixturesReady: boolean;
    /** Mount a fixture at `width`, optionally applying a falsification mutation. */
    __renderFixture: (
      id: string,
      width: number,
      falsify?: FixtureMutation,
    ) => void;
    /** Read the `[data-geo]` boxes of the currently mounted fixture. */
    __measure: () => MeasuredFixture;
  }
}

// One headless Chromium + one Page reused across the whole catalog (as the
// bespoke geometry tests already do in beforeAll/afterAll). `measure` re-renders
// a fixture at a width (optionally with a falsification mutation applied to the
// painted DOM) and reads back the MeasuredFixture — all in-page, no reload.
//
// The built page is served over a LOCAL HTTP server (not `file://`): Vite emits
// ES-module `<script type="module">` + a stylesheet `<link>`, and under `file://`
// the browser treats every asset as cross-origin (`origin: null`) and CORS-blocks
// the module/stylesheet fetch. http://127.0.0.1:<port> gives every asset the same
// real origin (the `file://`-fallback the harness design calls out).

export interface Measurer {
  measure(
    id: string,
    width: number,
    falsify?: FixtureMutation,
  ): Promise<MeasuredFixture>;
  /**
   * Uncaught page errors observed since the last call, and CLEARED by it.
   *
   * Drain-on-read is what makes attribution possible: the suite drains once
   * after the page loads and again after each fixture's sweep, so an error
   * belongs to the fixture that was on screen when it fired rather than to
   * every fixture measured after it.
   */
  takePageErrors(): string[];
  close(): Promise<void>;
}

const CONTENT_TYPE: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
};

function contentTypeFor(path: string): string {
  const dot = path.lastIndexOf(".");
  return (
    CONTENT_TYPE[dot >= 0 ? path.slice(dot) : ""] ?? "application/octet-stream"
  );
}

/**
 * Serve `outDir` statically on an ephemeral localhost port. Path-traversal is
 * blocked by normalizing and rejecting anything that escapes `outDir`.
 */
function serveDir(outDir: string): { origin: string; stop: () => void } {
  const server = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    async fetch(req) {
      const url = new URL(req.url);
      const rel = decodeURIComponent(
        url.pathname === "/" ? "/entry.html" : url.pathname,
      );
      const abs = normalize(join(outDir, rel));
      if (!abs.startsWith(outDir))
        return new Response("forbidden", { status: 403 });
      const file = Bun.file(abs);
      if (!(await file.exists()))
        return new Response("not found", { status: 404 });
      return new Response(file, {
        headers: { "content-type": contentTypeFor(abs) },
      });
    },
  });
  return {
    origin: `http://127.0.0.1:${server.port}`,
    stop: () => {
      // Force-close in-flight connections; we don't await the returned promise
      // (the browser is already closed by the time we stop the server).
      void server.stop(true);
    },
  };
}

export async function openMeasurer(outDir: string): Promise<Measurer> {
  const srv = serveDir(outDir);
  // Playwright's default launch timeout is 30s. Under host load (a CI box or a
  // box running several worktree servers) cold Chromium startup can briefly
  // exceed that even when serialized — a slow launch is not a real failure, so
  // give it generous headroom rather than flaking the geometry gate.
  const browser: Browser = await chromium.launch({ timeout: 120_000 });
  const page: Page = await browser.newPage();

  // A fixture that CRASHES must fail the gate, and until this listener existed
  // it could not: `__measure` reads whatever `[data-geo]` boxes are still in the
  // DOM, and React tearing a subtree down leaves that DOM behind for at least
  // one frame — so the settle loop happily agreed with itself twice and the
  // suite measured a corpse. The Layout Lab died of exactly this for months
  // (an adaptive-bar guard looping into React #185) with the gate green.
  //
  // We listen for `pageerror` ONLY — "an exception reached the top of the page"
  // — and deliberately not for `console` messages of type `error`. Those are a
  // much wider class: a 404 on a source map, a font that failed to load, a
  // component's own diagnostic `console.error`. None of them means a fixture
  // stopped rendering, and failing the geometry gate on them would make it fire
  // for reasons that have nothing to do with geometry. Nothing in the class we
  // DO care about is console-only: the measurer page mounts no error boundary,
  // so React funnels every uncaught render/commit error through `reportError`,
  // which surfaces here. (An unhandled promise rejection during the async
  // fixture load is caught earlier and differently — `__fixturesReady` never
  // flips, so `waitForFunction` below times out.)
  const pageErrors: string[] = [];
  page.on("pageerror", (err: Error) => {
    pageErrors.push(err.stack ?? `${err.name}: ${err.message}`);
  });

  await page.goto(`${srv.origin}/entry.html`);
  // The entry sets `window.__fixturesReady` after loadFixtures() resolves and the
  // globals are installed; wait for it rather than the bare function existence so
  // we never race the async fixture load.
  await page.waitForFunction(() => window.__fixturesReady === true, undefined, {
    timeout: 30_000,
  });

  return {
    async measure(id, width, falsify) {
      return page.evaluate(
        ({ id, width, falsify }) => {
          window.__renderFixture(id, width, falsify);
          return new Promise<MeasuredFixture>((resolve) => {
            // Settle by OBSERVATION, not by a frame count.
            //
            // The double-rAF this replaces assumed layout is final once the
            // render has been committed and painted, which holds only while
            // layout is pure synchronous CSS. A primitive that lays itself out
            // from a `ResizeObserver` — the adaptive bar, and every future
            // measure-then-decide primitive — settles LATER by construction:
            // the observer callback is delivered after layout, its handler is
            // rAF-debounced, and each decision it commits is a React render
            // whose own layout effect may measure and decide again. That is
            // several frames, and the number is a property of the fixture, not
            // a constant the harness can know.
            //
            // Measuring mid-settle reads a transient, so the gate would assert
            // on the PREVIOUS width's layout and fail with real-looking overlaps
            // — which is exactly what it did. Re-measure until two consecutive
            // frames agree, with a cap so a genuinely oscillating layout fails
            // loudly on its own geometry rather than hanging the suite.
            const MAX_SETTLE_FRAMES = 30;
            let previous: string | null = null;
            let frames = 0;
            const settle = (): void => {
              const measured = window.__measure();
              const signature = JSON.stringify(measured);
              if (signature === previous || frames >= MAX_SETTLE_FRAMES) {
                resolve(measured);
                return;
              }
              previous = signature;
              frames += 1;
              requestAnimationFrame(settle);
            };
            requestAnimationFrame(() => requestAnimationFrame(settle));
          });
        },
        { id, width, falsify },
      );
    },
    takePageErrors() {
      return pageErrors.splice(0, pageErrors.length);
    },
    async close() {
      await browser.close();
      srv.stop();
    },
  };
}
