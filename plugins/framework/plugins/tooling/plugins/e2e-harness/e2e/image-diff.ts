/**
 * Two captures, one verdict: how much of picture B is not picture A, and where.
 *
 * The reason to compare a mock against the running app is to make "does it
 * match?" a number an agent can read and a picture it can look at, rather than
 * an eyeball. Both captures come out of the same Chromium at the same width, so
 * a pixel-level comparison is honest here in a way it never is between a design
 * tool's export and a browser (different text rasterisers, different
 * anti-aliasing): what differs is the design, not the renderer.
 *
 * Decoded, compared and re-encoded INSIDE the page, on a canvas — the same move
 * `pixels.ts` makes, for the same reason: Chromium already owns a PNG codec, so
 * the harness carries no image dependency and parses no format. The cost is
 * the bytes crossing the bridge as base64 twice, which is fine for a screenful
 * and is not what this is for anyway.
 *
 * Per-pixel distance is pixelmatch's: the YIQ colour difference, squared and
 * weighted, against a threshold in [0, 1] (0.1 by default — the same default).
 * What is deliberately NOT ported is its anti-aliasing detector; a mock and an
 * app differ in whole regions, and a one-pixel edge halo is noise the grid
 * below already averages away.
 */
import type { Page } from "playwright";

export interface ImageDiffOptions {
  /** YIQ distance threshold in [0, 1]; lower is stricter. Default 0.1. */
  threshold?: number;
  /** The coarse heatmap's cell grid. Default 6 columns × 4 rows. */
  grid?: { cols: number; rows: number };
  /** Captions over the two captures in the side-by-side sheet. */
  labels?: [string, string];
}

export interface ImageSize {
  width: number;
  height: number;
}

export interface ImageDiff {
  a: ImageSize;
  b: ImageSize;
  /** The compared region — the two captures' intersection, from the top-left. */
  compared: ImageSize;
  /** Both captures have exactly the same size; a difference is itself a finding. */
  sameSize: boolean;
  /** Pixels compared (the region's area). */
  total: number;
  /** Pixels whose distance passed the threshold. */
  differing: number;
  /** `differing / total`, in [0, 1]. */
  ratio: number;
  /** Row-major cells, each the differing ratio inside that cell. */
  grid: number[][];
  /** The compared region: a faint grey of A with every differing pixel in red. */
  diffPng: Buffer;
  /** A, B and the diff side by side under captions — one image to read. */
  sideBySidePng: Buffer;
}

/**
 * Compare two PNG captures. `page` is any live page — the work is pure canvas
 * arithmetic and touches nothing of the document.
 *
 * Throws on a capture that will not decode; a diff that silently compared
 * nothing would report a perfect match.
 */
export async function diffImages(
  page: Page,
  a: Buffer,
  b: Buffer,
  opts: ImageDiffOptions = {},
): Promise<ImageDiff> {
  const threshold = opts.threshold ?? 0.1;
  if (!(threshold >= 0 && threshold <= 1)) {
    throw new Error(
      `diffImages: threshold must be in [0, 1], got ${threshold}`,
    );
  }
  const grid = opts.grid ?? { cols: 6, rows: 4 };
  const labels = opts.labels ?? ["a", "b"];

  const out = await page.evaluate(
    async ({ aB64, bB64, threshold, grid, labels }) => {
      async function decode(b64: string): Promise<{
        width: number;
        height: number;
        data: Uint8ClampedArray;
        img: HTMLImageElement;
      }> {
        const img = new Image();
        img.src = `data:image/png;base64,${b64}`;
        await img.decode();
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("diffImages: no 2d context");
        ctx.drawImage(img, 0, 0);
        return {
          width: img.width,
          height: img.height,
          data: ctx.getImageData(0, 0, img.width, img.height).data,
          img,
        };
      }

      const A = await decode(aB64);
      const B = await decode(bB64);
      const width = Math.min(A.width, B.width);
      const height = Math.min(A.height, B.height);

      // pixelmatch's colour metric. Alpha is blended onto white first so a
      // transparent pixel compares as what it would show on the page.
      const blend = (c: number, a: number): number => 255 + (c - 255) * a;
      const yiq = (
        d: Uint8ClampedArray,
        i: number,
      ): [number, number, number] => {
        const a = d[i + 3]! / 255;
        const r = blend(d[i]!, a);
        const g = blend(d[i + 1]!, a);
        const b = blend(d[i + 2]!, a);
        return [
          r * 0.29889531 + g * 0.58662247 + b * 0.11448223,
          r * 0.59597799 - g * 0.2741761 - b * 0.32180189,
          r * 0.21147017 - g * 0.52261711 + b * 0.31114694,
        ];
      };
      const maxDelta = 35215 * threshold * threshold;

      const diffCanvas = document.createElement("canvas");
      diffCanvas.width = width;
      diffCanvas.height = height;
      const dctx = diffCanvas.getContext("2d");
      if (!dctx) throw new Error("diffImages: no 2d context");
      const diff = dctx.createImageData(width, height);

      const cells = new Array<number>(grid.cols * grid.rows).fill(0);
      const cellTotals = new Array<number>(grid.cols * grid.rows).fill(0);
      let differing = 0;

      for (let y = 0; y < height; y++) {
        const cy = Math.min(
          grid.rows - 1,
          Math.floor((y * grid.rows) / height),
        );
        for (let x = 0; x < width; x++) {
          const ia = (y * A.width + x) * 4;
          const ib = (y * B.width + x) * 4;
          const io = (y * width + x) * 4;
          const [ya, ia_, qa] = yiq(A.data, ia);
          const [yb, ib_, qb] = yiq(B.data, ib);
          const dy = ya - yb;
          const di = ia_ - ib_;
          const dq = qa - qb;
          const delta = 0.5053 * dy * dy + 0.299 * di * di + 0.1957 * dq * dq;
          const cell =
            cy * grid.cols +
            Math.min(grid.cols - 1, Math.floor((x * grid.cols) / width));
          cellTotals[cell]! += 1;
          if (delta > maxDelta) {
            differing += 1;
            cells[cell]! += 1;
            diff.data[io] = 255;
            diff.data[io + 1] = 0;
            diff.data[io + 2] = 0;
          } else {
            // A faint grey of A, so the red reads against the layout it sits in.
            const v = Math.round(255 + (ya - 255) * 0.1);
            diff.data[io] = v;
            diff.data[io + 1] = v;
            diff.data[io + 2] = v;
          }
          diff.data[io + 3] = 255;
        }
      }
      dctx.putImageData(diff, 0, 0);

      // The sheet: A | B | diff, each under its caption.
      const CAPTION = 28;
      const GAP = 16;
      const sheet = document.createElement("canvas");
      sheet.width = A.width + B.width + width + GAP * 2;
      sheet.height = CAPTION + Math.max(A.height, B.height, height);
      const sctx = sheet.getContext("2d");
      if (!sctx) throw new Error("diffImages: no 2d context");
      sctx.fillStyle = "#808080";
      sctx.fillRect(0, 0, sheet.width, sheet.height);
      sctx.fillStyle = "#ffffff";
      sctx.font = "bold 15px system-ui, sans-serif";
      sctx.textBaseline = "middle";
      const pct = ((differing / (width * height)) * 100).toFixed(2);
      const panels: [string, CanvasImageSource, number, number][] = [
        [labels[0], A.img, A.width, A.height],
        [labels[1], B.img, B.width, B.height],
        [`diff — ${pct}% of pixels differ`, diffCanvas, width, height],
      ];
      let x = 0;
      for (const [label, src, w, h] of panels) {
        sctx.fillText(label, x + 8, CAPTION / 2);
        sctx.drawImage(src, x, CAPTION, w, h);
        x += w + GAP;
      }

      const strip = (url: string): string => url.slice(url.indexOf(",") + 1);
      const rows: number[][] = [];
      for (let r = 0; r < grid.rows; r++) {
        const row: number[] = [];
        for (let c = 0; c < grid.cols; c++) {
          const i = r * grid.cols + c;
          const total = cellTotals[i]!;
          row.push(total === 0 ? 0 : cells[i]! / total);
        }
        rows.push(row);
      }
      return {
        a: { width: A.width, height: A.height },
        b: { width: B.width, height: B.height },
        width,
        height,
        differing,
        grid: rows,
        diffB64: strip(diffCanvas.toDataURL("image/png")),
        sheetB64: strip(sheet.toDataURL("image/png")),
      };
    },
    {
      aB64: a.toString("base64"),
      bB64: b.toString("base64"),
      threshold,
      grid,
      labels,
    },
  );

  const total = out.width * out.height;
  if (total === 0) {
    throw new Error(
      `diffImages: nothing to compare — ${out.a.width}×${out.a.height} vs ${out.b.width}×${out.b.height}`,
    );
  }
  return {
    a: out.a,
    b: out.b,
    compared: { width: out.width, height: out.height },
    sameSize: out.a.width === out.b.width && out.a.height === out.b.height,
    total,
    differing: out.differing,
    ratio: out.differing / total,
    grid: out.grid,
    diffPng: Buffer.from(out.diffB64, "base64"),
    sideBySidePng: Buffer.from(out.sheetB64, "base64"),
  };
}

/**
 * The heatmap as transcript lines: one row per grid row, each cell the
 * percentage of its pixels that differ — so "where does it drift?" is
 * answerable from the text alone, without opening the diff image.
 */
export function heatmapText(grid: number[][]): string {
  return grid
    .map((row) =>
      row.map((cell) => `${(cell * 100).toFixed(1).padStart(5)}%`).join(" "),
    )
    .join("\n");
}
