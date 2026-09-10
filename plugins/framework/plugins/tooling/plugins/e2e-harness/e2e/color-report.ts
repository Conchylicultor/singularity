/**
 * The colour half of "does the app match the mock?" — a report that NAMES
 * colours, where `diffImages` only counts pixels.
 *
 * A pixel diff is salient by construction: it lights up where things differ
 * by more than a threshold, so a surface one shade off passes and a wrong
 * background reads as "31% of pixels differ" with no colour anywhere in the
 * transcript. This report answers the other questions: what are the dominant
 * colours of each picture and how far apart are the matching ones, what is
 * the average colour of each region, and how does the tone run across the
 * picture (a gradient in the mock that the app painted flat).
 *
 * Distances are CIE76 ΔE in L*a*b* — perceptual enough for "is this the same
 * colour": ~2 is the just-noticeable difference, 5 is plainly a different
 * shade, 10+ is a different colour. Averages cancel text edges and
 * anti-aliasing, which is what lets this see a tint shift the pixel diff
 * waves through without being fooled by glyph outlines.
 *
 * Same in-page canvas pass as the diff, for the same reason: no image codec
 * in the harness.
 */
import type { Page } from "playwright";

export interface ColorReportOptions {
  /** ΔE at or above which a pair is listed as drifting. Default 5. */
  deltaE?: number;
  /** The cell grid for region means and the mosaic. Default 6 × 4. */
  grid?: { cols: number; rows: number };
  /** How many dominant colours to keep per picture. Default 8. */
  paletteSize?: number;
  /** Bands for the luminance profiles. Default 12. */
  bands?: number;
  /** Captions for the sheet. */
  labels?: [string, string];
}

/** One colour with the share of the picture it covers, in [0, 1]. */
export interface Swatch {
  hex: string;
  coverage: number;
}

/** A dominant colour of A and the closest dominant colour of B. */
export interface PaletteMatch {
  a: Swatch;
  b: Swatch;
  deltaE: number;
}

/** The mean colour of one grid cell in each picture. */
export interface CellMean {
  row: number;
  col: number;
  a: string;
  b: string;
  deltaE: number;
}

export interface ColorReport {
  /** The most-covered colour of each picture. */
  background: PaletteMatch;
  /** A's dominant colours, by coverage, each with B's nearest. */
  palette: PaletteMatch[];
  /** Every cell's mean colour pair, row-major. */
  cells: CellMean[];
  /** Mean ΔE over all cells. */
  meanCellDeltaE: number;
  /** L* (0–100) per horizontal band, top → bottom, for each picture. */
  rowProfile: { a: number[]; b: number[] };
  /** L* per vertical band, left → right. */
  colProfile: { a: number[]; b: number[] };
  /** The ΔE the caller asked drifting pairs to be judged against. */
  deltaEThreshold: number;
  /** Palette matches + cell mosaics + profiles, drawn — one image to read. */
  sheetPng: Buffer;
}

/**
 * Compare the colours of two PNG captures. `page` is any live page.
 *
 * Throws on a capture that will not decode; a report over nothing would say
 * every colour matches.
 */
export async function colorReport(
  page: Page,
  a: Buffer,
  b: Buffer,
  opts: ColorReportOptions = {},
): Promise<ColorReport> {
  const deltaE = opts.deltaE ?? 5;
  const grid = opts.grid ?? { cols: 6, rows: 4 };
  const paletteSize = opts.paletteSize ?? 8;
  const bands = opts.bands ?? 12;
  const labels = opts.labels ?? ["a", "b"];

  const out = await page.evaluate(
    async ({ aB64, bB64, grid, paletteSize, bands, labels }) => {
      // --- decode -------------------------------------------------------
      async function decode(b64: string): Promise<{
        width: number;
        height: number;
        data: Uint8ClampedArray;
      }> {
        const img = new Image();
        img.src = `data:image/png;base64,${b64}`;
        await img.decode();
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("colorReport: no 2d context");
        ctx.drawImage(img, 0, 0);
        return {
          width: img.width,
          height: img.height,
          data: ctx.getImageData(0, 0, img.width, img.height).data,
        };
      }
      const A = await decode(aB64);
      const B = await decode(bB64);
      type Img = typeof A;

      // --- colour maths ---------------------------------------------------
      type Lab = [number, number, number];
      const lin = (c: number): number => {
        const s = c / 255;
        return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      };
      const f = (t: number): number =>
        t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
      const lab = (r: number, g: number, b: number): Lab => {
        const R = lin(r);
        const G = lin(g);
        const Bl = lin(b);
        const x = (R * 0.4124 + G * 0.3576 + Bl * 0.1805) / 0.95047;
        const y = R * 0.2126 + G * 0.7152 + Bl * 0.0722;
        const z = (R * 0.0193 + G * 0.1192 + Bl * 0.9505) / 1.08883;
        return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
      };
      const dE = (p: Lab, q: Lab): number =>
        Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
      const hex = (r: number, g: number, b: number): string =>
        "#" +
        [r, g, b]
          .map((v) => Math.round(v).toString(16).padStart(2, "0"))
          .join("");

      // --- palette: quantise, rank by coverage, merge near-duplicates ------
      type Bucket = { n: number; r: number; g: number; b: number };
      function palette(
        img: Img,
        keep: number,
      ): { rgb: [number, number, number]; coverage: number }[] {
        const buckets = new Map<number, Bucket>();
        const d = img.data;
        const total = img.width * img.height;
        for (let i = 0; i < d.length; i += 4) {
          const r = d[i]!;
          const g = d[i + 1]!;
          const b = d[i + 2]!;
          // 5 bits per channel: close shades share a bucket, and the bucket's
          // reported colour is the MEAN of what fell in, not the bucket centre.
          const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
          const bk = buckets.get(key);
          if (bk) {
            bk.n += 1;
            bk.r += r;
            bk.g += g;
            bk.b += b;
          } else buckets.set(key, { n: 1, r, g, b });
        }
        const ranked = [...buckets.values()]
          .sort((p, q) => q.n - p.n)
          .map((bk) => ({
            rgb: [bk.r / bk.n, bk.g / bk.n, bk.b / bk.n] as [
              number,
              number,
              number,
            ],
            coverage: bk.n / total,
          }));
        // Adjacent buckets of one flat surface (a 5-bit boundary running
        // through it) would list the same colour twice; fold anything within
        // a just-noticeable difference into the larger entry.
        const merged: typeof ranked = [];
        for (const entry of ranked) {
          const near = merged.find(
            (m) => dE(lab(...m.rgb), lab(...entry.rgb)) < 2.5,
          );
          if (near) near.coverage += entry.coverage;
          else merged.push(entry);
          if (merged.length >= keep * 4) break;
        }
        // A fold adds coverage to an entry ranked earlier, so the order the
        // buckets came in is no longer the order of coverage.
        return merged.sort((p, q) => q.coverage - p.coverage);
      }
      const palA = palette(A, paletteSize);
      const palB = palette(B, paletteSize);
      // A's top colours, each matched to B's nearest among a wider set, so a
      // small mock accent still finds its counterpart in the app.
      const matches = palA.slice(0, paletteSize).map((pa) => {
        const la = lab(...pa.rgb);
        let best = palB[0]!;
        let bestD = Infinity;
        for (const pb of palB.slice(0, paletteSize * 3)) {
          const dd = dE(la, lab(...pb.rgb));
          if (dd < bestD) {
            bestD = dd;
            best = pb;
          }
        }
        return {
          a: { hex: hex(...pa.rgb), coverage: pa.coverage },
          b: { hex: hex(...best.rgb), coverage: best.coverage },
          deltaE: bestD,
        };
      });

      // --- cell means + band profiles --------------------------------------
      function means(img: Img): {
        cells: [number, number, number][];
        rows: number[];
        cols: number[];
      } {
        type Sum4 = [number, number, number, number];
        type Sum2 = [number, number];
        const cellSum = Array.from(
          { length: grid.cols * grid.rows },
          (): Sum4 => [0, 0, 0, 0],
        );
        const rowSum = Array.from({ length: bands }, (): Sum2 => [0, 0]);
        const colSum = Array.from({ length: bands }, (): Sum2 => [0, 0]);
        const d = img.data;
        for (let y = 0; y < img.height; y++) {
          const cy = Math.min(
            grid.rows - 1,
            Math.floor((y * grid.rows) / img.height),
          );
          const by = Math.min(bands - 1, Math.floor((y * bands) / img.height));
          for (let x = 0; x < img.width; x++) {
            const i = (y * img.width + x) * 4;
            const r = d[i]!;
            const g = d[i + 1]!;
            const b = d[i + 2]!;
            const cx = Math.min(
              grid.cols - 1,
              Math.floor((x * grid.cols) / img.width),
            );
            const bx = Math.min(bands - 1, Math.floor((x * bands) / img.width));
            const c = cellSum[cy * grid.cols + cx]!;
            c[0] += r;
            c[1] += g;
            c[2] += b;
            c[3] += 1;
            // Luminance from linear light, as L* is defined on.
            const Y = lin(r) * 0.2126 + lin(g) * 0.7152 + lin(b) * 0.0722;
            const L = 116 * f(Y) - 16;
            rowSum[by]![0] += L;
            rowSum[by]![1] += 1;
            colSum[bx]![0] += L;
            colSum[bx]![1] += 1;
          }
        }
        return {
          cells: cellSum.map((c): [number, number, number] => [
            c[0] / c[3],
            c[1] / c[3],
            c[2] / c[3],
          ]),
          rows: rowSum.map(([s, n]) => (n ? s / n : 0)),
          cols: colSum.map(([s, n]) => (n ? s / n : 0)),
        };
      }
      const mA = means(A);
      const mB = means(B);
      const cells = mA.cells.map((ca, i) => {
        const cb = mB.cells[i]!;
        return {
          row: Math.floor(i / grid.cols),
          col: i % grid.cols,
          a: hex(...ca),
          b: hex(...cb),
          deltaE: dE(lab(...ca), lab(...cb)),
        };
      });

      // --- the sheet --------------------------------------------------------
      const SW = 72; // swatch width
      const SH = 36; // swatch height / row pitch
      const PAD = 12;
      const CELL = 40;
      const mosaicW = grid.cols * CELL;
      const mosaicH = grid.rows * CELL;
      const paletteH = PAD + 22 + matches.length * SH + PAD;
      const mosaicsH = PAD + 22 + mosaicH + PAD;
      const profileH = PAD + 22 + 80 + PAD;
      const width = Math.max(560, mosaicW * 2 + PAD * 3);
      const sheet = document.createElement("canvas");
      sheet.width = width;
      sheet.height = paletteH + mosaicsH + profileH;
      const ctx = sheet.getContext("2d");
      if (!ctx) throw new Error("colorReport: no 2d context");
      ctx.fillStyle = "#808080";
      ctx.fillRect(0, 0, sheet.width, sheet.height);
      ctx.textBaseline = "middle";
      const heading = (text: string, y: number): void => {
        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 14px system-ui, sans-serif";
        ctx.fillText(text, PAD, y + 11);
      };
      const body = (text: string, x: number, y: number): void => {
        ctx.fillStyle = "#ffffff";
        ctx.font = "13px ui-monospace, monospace";
        ctx.fillText(text, x, y);
      };

      let y = PAD;
      heading(`palette — ${labels[0]} → nearest in ${labels[1]}`, y);
      y += 22;
      for (const m of matches) {
        ctx.fillStyle = m.a.hex;
        ctx.fillRect(PAD, y, SW, SH - 6);
        ctx.fillStyle = m.b.hex;
        ctx.fillRect(PAD + SW + 4, y, SW, SH - 6);
        body(
          `${m.a.hex} ${(m.a.coverage * 100).toFixed(1).padStart(5)}%  →  ${m.b.hex} ${(m.b.coverage * 100).toFixed(1).padStart(5)}%   ΔE ${m.deltaE.toFixed(1)}`,
          PAD + SW * 2 + 16,
          y + (SH - 6) / 2,
        );
        y += SH;
      }

      y += PAD;
      heading(`region means — ${labels[0]} | ${labels[1]}`, y);
      y += 22;
      const drawMosaic = (cs: [number, number, number][], x0: number): void => {
        cs.forEach((c, i) => {
          ctx.fillStyle = hex(...c);
          ctx.fillRect(
            x0 + (i % grid.cols) * CELL,
            y + Math.floor(i / grid.cols) * CELL,
            CELL,
            CELL,
          );
        });
      };
      drawMosaic(mA.cells, PAD);
      drawMosaic(mB.cells, PAD * 2 + mosaicW);
      y += mosaicH + PAD;

      heading(
        `luminance by row band (L*), ${labels[0]} white / ${labels[1]} black`,
        y,
      );
      y += 22;
      // The plot spans the range the two pictures actually use, padded: a
      // dark UI lives between L* 10 and 20, and on a 0–100 axis a gradient
      // there is a flat line.
      const allL = [...mA.rows, ...mB.rows, ...mA.cols, ...mB.cols];
      const lo = Math.max(0, Math.min(...allL) - 5);
      const hi = Math.min(100, Math.max(...allL) + 5);
      const plot = (
        vals: number[],
        x0: number,
        w: number,
        color: string,
      ): void => {
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        vals.forEach((L, i) => {
          const px = x0 + (i + 0.5) * (w / vals.length);
          const py = y + 80 - ((L - lo) / (hi - lo)) * 80;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        });
        ctx.stroke();
      };
      const half = (width - PAD * 3) / 2;
      plot(mA.rows, PAD, half, "#ffffff");
      plot(mB.rows, PAD, half, "#000000");
      plot(mA.cols, PAD * 2 + half, half, "#ffffff");
      plot(mB.cols, PAD * 2 + half, half, "#000000");
      body(`rows ↓  (L* ${Math.round(lo)}–${Math.round(hi)})`, PAD, y + 90 - 8);
      body("columns →", PAD * 2 + half, y + 90 - 8);

      const strip = (url: string): string => url.slice(url.indexOf(",") + 1);
      return {
        matches,
        cells,
        rows: { a: mA.rows, b: mB.rows },
        cols: { a: mA.cols, b: mB.cols },
        sheetB64: strip(sheet.toDataURL("image/png")),
      };
    },
    {
      aB64: a.toString("base64"),
      bB64: b.toString("base64"),
      grid,
      paletteSize,
      bands,
      labels,
    },
  );

  const background = out.matches[0];
  if (background === undefined) {
    throw new Error("colorReport: no colours found — an empty capture?");
  }
  return {
    background,
    palette: out.matches,
    cells: out.cells,
    meanCellDeltaE:
      out.cells.reduce((s, c) => s + c.deltaE, 0) / out.cells.length,
    rowProfile: out.rows,
    colProfile: out.cols,
    deltaEThreshold: deltaE,
    sheetPng: Buffer.from(out.sheetB64, "base64"),
  };
}

/** The report as transcript lines. */
export function colorReportText(r: ColorReport): string {
  const pct = (v: number): string => `${(v * 100).toFixed(1).padStart(5)}%`;
  const lines: string[] = [];
  const bg = r.background;
  lines.push(
    `background:   ${bg.a.hex} ${pct(bg.a.coverage)}  →  ${bg.b.hex} ${pct(bg.b.coverage)}   ΔE ${bg.deltaE.toFixed(1)}${bg.deltaE >= r.deltaEThreshold ? "  ← drifts" : ""}`,
  );
  lines.push(`palette (by coverage, → nearest counterpart colour):`);
  for (const m of r.palette) {
    lines.push(
      `  ${m.a.hex} ${pct(m.a.coverage)}  →  ${m.b.hex} ${pct(m.b.coverage)}   ΔE ${m.deltaE.toFixed(1).padStart(5)}${m.deltaE >= r.deltaEThreshold ? "  ← drifts" : ""}`,
    );
  }
  const drifting = r.cells
    .filter((c) => c.deltaE >= r.deltaEThreshold)
    .sort((p, q) => q.deltaE - p.deltaE);
  lines.push(
    `region means: mean ΔE ${r.meanCellDeltaE.toFixed(1)}, ${drifting.length} of ${r.cells.length} cells at or above ΔE ${r.deltaEThreshold}`,
  );
  for (const c of drifting) {
    lines.push(
      `  r${c.row + 1}c${c.col + 1}  ${c.a}  →  ${c.b}   ΔE ${c.deltaE.toFixed(1).padStart(5)}`,
    );
  }
  const profile = (vals: number[]): string =>
    vals.map((v) => String(Math.round(v)).padStart(3)).join(" ");
  lines.push(`luminance L* by row band, top → bottom:`);
  lines.push(`  a ${profile(r.rowProfile.a)}`);
  lines.push(`  b ${profile(r.rowProfile.b)}`);
  lines.push(`luminance L* by column band, left → right:`);
  lines.push(`  a ${profile(r.colProfile.a)}`);
  lines.push(`  b ${profile(r.colProfile.b)}`);
  return lines.join("\n");
}
