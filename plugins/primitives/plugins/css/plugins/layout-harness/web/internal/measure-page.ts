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
    __renderFixture: (id: string, width: number, falsify?: FixtureMutation) => void;
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
  measure(id: string, width: number, falsify?: FixtureMutation): Promise<MeasuredFixture>;
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
  return CONTENT_TYPE[dot >= 0 ? path.slice(dot) : ""] ?? "application/octet-stream";
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
      const rel = decodeURIComponent(url.pathname === "/" ? "/entry.html" : url.pathname);
      const abs = normalize(join(outDir, rel));
      if (!abs.startsWith(outDir)) return new Response("forbidden", { status: 403 });
      const file = Bun.file(abs);
      if (!(await file.exists())) return new Response("not found", { status: 404 });
      return new Response(file, { headers: { "content-type": contentTypeFor(abs) } });
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
  const browser: Browser = await chromium.launch();
  const page: Page = await browser.newPage();
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
            // Double-rAF settle so the post-render (incl. mutation) layout is
            // final before measuring.
            requestAnimationFrame(() =>
              requestAnimationFrame(() => resolve(window.__measure())),
            );
          });
        },
        { id, width, falsify },
      );
    },
    async close() {
      await browser.close();
      srv.stop();
    },
  };
}
