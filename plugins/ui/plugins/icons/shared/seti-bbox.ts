/**
 * The bounding box of what an SVG glyph actually paints, from its geometry —
 * so the vendored Seti glyphs can be cropped to it (`normalizeSetiSvg`).
 *
 * Every shape is flattened to points (curves and arcs sampled finely, which is
 * exact to well under a unit at Seti's 32-unit scale), each point taken through
 * the element's accumulated transform, and a stroked shape's box grown by half
 * its stroke. A shape that paints nothing (no fill and no stroke, or zero
 * opacity) does not count. Anything this cannot measure throws: a guessed box
 * would silently mis-crop a glyph.
 */

export interface BBoxElement {
  tag: string;
  attrs: ReadonlyMap<string, string>;
  children: readonly BBoxElement[];
}

export interface Box {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** An affine transform `[a b c d e f]`: x' = a·x + c·y + e, y' = b·x + d·y + f. */
type Matrix = readonly [number, number, number, number, number, number];

const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

function multiply(m: Matrix, n: Matrix): Matrix {
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}

function apply(m: Matrix, x: number, y: number): [number, number] {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

const NUMBER_RE = /[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/g;

function numbers(src: string): number[] {
  return [...src.matchAll(NUMBER_RE)].map((m) => Number(m[0]));
}

/** A `transform` attribute as one matrix. */
export function parseTransform(src: string): Matrix {
  let out = IDENTITY;
  const consumed = src.replace(
    /(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/g,
    (_m, fn: string, args: string) => {
      const n = numbers(args);
      let t: Matrix;
      switch (fn) {
        case "matrix":
          if (n.length !== 6) throw new Error(`[seti] bad matrix(${args})`);
          t = n as unknown as Matrix;
          break;
        case "translate":
          t = [1, 0, 0, 1, n[0] ?? 0, n[1] ?? 0];
          break;
        case "scale":
          t = [n[0] ?? 1, 0, 0, n[1] ?? n[0] ?? 1, 0, 0];
          break;
        case "rotate": {
          const a = ((n[0] ?? 0) * Math.PI) / 180;
          const [cx, cy] = [n[1] ?? 0, n[2] ?? 0];
          const r: Matrix = [
            Math.cos(a),
            Math.sin(a),
            -Math.sin(a),
            Math.cos(a),
            0,
            0,
          ];
          t = multiply(multiply([1, 0, 0, 1, cx, cy], r), [
            1,
            0,
            0,
            1,
            -cx,
            -cy,
          ]);
          break;
        }
        case "skewX":
          t = [1, 0, Math.tan(((n[0] ?? 0) * Math.PI) / 180), 1, 0, 0];
          break;
        default:
          t = [1, Math.tan(((n[0] ?? 0) * Math.PI) / 180), 0, 1, 0, 0];
      }
      out = multiply(out, t);
      return "";
    },
  );
  if (consumed.replace(/[\s,]/g, "") !== "") {
    throw new Error(`[seti] unsupported transform "${src}"`);
  }
  return out;
}

// ── Path data ───────────────────────────────────────────────────────────────

const STICKY_NUMBER_RE = new RegExp(NUMBER_RE.source, "y");

const SAMPLES = 32;

/** Reads path data one token at a time; arc flags are single characters. */
class PathReader {
  private i = 0;
  constructor(private readonly d: string) {}

  private skip(): void {
    while (this.i < this.d.length && /[\s,]/.test(this.d[this.i]!)) this.i++;
  }

  done(): boolean {
    this.skip();
    return this.i >= this.d.length;
  }

  command(): string | undefined {
    this.skip();
    const c = this.d[this.i];
    if (c !== undefined && /[MmLlHhVvCcSsQqTtAaZz]/.test(c)) {
      this.i++;
      return c;
    }
    return undefined;
  }

  number(): number {
    this.skip();
    STICKY_NUMBER_RE.lastIndex = this.i;
    const hit = STICKY_NUMBER_RE.exec(this.d);
    if (!hit)
      throw new Error(
        `[seti] bad path data at "${this.d.slice(this.i, this.i + 12)}"`,
      );
    this.i += hit[0].length;
    return Number(hit[0]);
  }

  flag(): number {
    this.skip();
    const c = this.d[this.i];
    if (c !== "0" && c !== "1")
      throw new Error(`[seti] bad arc flag in path data`);
    this.i++;
    return Number(c);
  }
}

function arcPoints(
  x1: number,
  y1: number,
  rxIn: number,
  ryIn: number,
  phiDeg: number,
  largeArc: number,
  sweep: number,
  x2: number,
  y2: number,
): [number, number][] {
  let rx = Math.abs(rxIn);
  let ry = Math.abs(ryIn);
  if (rx === 0 || ry === 0 || (x1 === x2 && y1 === y2)) return [[x2, y2]];
  // SVG 1.1 implementation notes, F.6.5: endpoint → centre parameterization.
  const phi = (phiDeg * Math.PI) / 180;
  const cos = Math.cos(phi);
  const sin = Math.sin(phi);
  const dx = (x1 - x2) / 2;
  const dy = (y1 - y2) / 2;
  const x1p = cos * dx + sin * dy;
  const y1p = -sin * dx + cos * dy;
  const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lambda > 1) {
    rx *= Math.sqrt(lambda);
    ry *= Math.sqrt(lambda);
  }
  const num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
  const den = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
  const coef =
    (largeArc === sweep ? -1 : 1) * Math.sqrt(Math.max(0, num / den));
  const cxp = (coef * rx * y1p) / ry;
  const cyp = (-coef * ry * x1p) / rx;
  const cx = cos * cxp - sin * cyp + (x1 + x2) / 2;
  const cy = sin * cxp + cos * cyp + (y1 + y2) / 2;
  const angle = (ux: number, uy: number, vx: number, vy: number) =>
    Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  const t1 = angle(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let dt = angle(
    (x1p - cxp) / rx,
    (y1p - cyp) / ry,
    (-x1p - cxp) / rx,
    (-y1p - cyp) / ry,
  );
  if (!sweep && dt > 0) dt -= 2 * Math.PI;
  if (sweep && dt < 0) dt += 2 * Math.PI;
  const out: [number, number][] = [];
  for (let k = 1; k <= SAMPLES; k++) {
    const t = t1 + (dt * k) / SAMPLES;
    const ex = rx * Math.cos(t);
    const ey = ry * Math.sin(t);
    out.push([cos * ex - sin * ey + cx, sin * ex + cos * ey + cy]);
  }
  return out;
}

/** Every point a path's outline passes through (curves and arcs sampled). */
export function pathPoints(d: string): [number, number][] {
  const r = new PathReader(d);
  const pts: [number, number][] = [];
  let [x, y] = [0, 0];
  let [sx, sy] = [0, 0];
  // The last control point, for S / T reflection.
  let ctrl: [number, number] | null = null;
  let prev = "";
  let cmd: string | undefined;
  while (!r.done()) {
    const next = r.command();
    if (next !== undefined) cmd = next;
    else if (cmd === undefined)
      throw new Error("[seti] path data must start with a command");
    else if (cmd === "M") cmd = "L";
    else if (cmd === "m") cmd = "l";
    const c = cmd!;
    const rel = c === c.toLowerCase() && c !== "z";
    const ox = rel ? x : 0;
    const oy = rel ? y : 0;
    const upper = c.toUpperCase();
    let nextCtrl: [number, number] | null = null;
    switch (upper) {
      case "M":
        x = r.number() + ox;
        y = r.number() + oy;
        [sx, sy] = [x, y];
        pts.push([x, y]);
        break;
      case "L":
        x = r.number() + ox;
        y = r.number() + oy;
        pts.push([x, y]);
        break;
      case "H":
        x = r.number() + ox;
        pts.push([x, y]);
        break;
      case "V":
        y = r.number() + oy;
        pts.push([x, y]);
        break;
      case "Z":
        [x, y] = [sx, sy];
        break;
      case "C":
      case "S": {
        const c1: [number, number] =
          upper === "C"
            ? [r.number() + ox, r.number() + oy]
            : ctrl !== null && /[CcSs]/.test(prev)
              ? [2 * x - ctrl[0], 2 * y - ctrl[1]]
              : [x, y];
        const c2: [number, number] = [r.number() + ox, r.number() + oy];
        const end: [number, number] = [r.number() + ox, r.number() + oy];
        for (let k = 1; k <= SAMPLES; k++) {
          const t = k / SAMPLES;
          const u = 1 - t;
          pts.push([
            u * u * u * x +
              3 * u * u * t * c1[0] +
              3 * u * t * t * c2[0] +
              t * t * t * end[0],
            u * u * u * y +
              3 * u * u * t * c1[1] +
              3 * u * t * t * c2[1] +
              t * t * t * end[1],
          ]);
        }
        nextCtrl = c2;
        [x, y] = end;
        break;
      }
      case "Q":
      case "T": {
        const q: [number, number] =
          upper === "Q"
            ? [r.number() + ox, r.number() + oy]
            : ctrl !== null && /[QqTt]/.test(prev)
              ? [2 * x - ctrl[0], 2 * y - ctrl[1]]
              : [x, y];
        const end: [number, number] = [r.number() + ox, r.number() + oy];
        for (let k = 1; k <= SAMPLES; k++) {
          const t = k / SAMPLES;
          const u = 1 - t;
          pts.push([
            u * u * x + 2 * u * t * q[0] + t * t * end[0],
            u * u * y + 2 * u * t * q[1] + t * t * end[1],
          ]);
        }
        nextCtrl = q;
        [x, y] = end;
        break;
      }
      case "A": {
        const rx = r.number();
        const ry = r.number();
        const phi = r.number();
        const large = r.flag();
        const sweep = r.flag();
        const ex = r.number() + ox;
        const ey = r.number() + oy;
        pts.push(...arcPoints(x, y, rx, ry, phi, large, sweep, ex, ey));
        [x, y] = [ex, ey];
        break;
      }
    }
    ctrl = nextCtrl;
    prev = c;
  }
  return pts;
}

// ── Shapes ──────────────────────────────────────────────────────────────────

function num(
  el: BBoxElement,
  attrs: ReadonlyMap<string, string>,
  key: string,
): number {
  const v = attrs.get(key);
  const n = v === undefined ? 0 : Number(v.replace(/px$/, ""));
  if (!Number.isFinite(n))
    throw new Error(`[seti] <${el.tag}> has ${key}="${v}"`);
  return n;
}

function ellipsePoints(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
): [number, number][] {
  const out: [number, number][] = [];
  for (let k = 0; k < SAMPLES * 2; k++) {
    const t = (k / (SAMPLES * 2)) * 2 * Math.PI;
    out.push([cx + rx * Math.cos(t), cy + ry * Math.sin(t)]);
  }
  return out;
}

function shapePoints(
  el: BBoxElement,
  a: ReadonlyMap<string, string>,
): [number, number][] {
  switch (el.tag) {
    case "path":
      return pathPoints(a.get("d") ?? "");
    case "circle": {
      const r = num(el, a, "r");
      return ellipsePoints(num(el, a, "cx"), num(el, a, "cy"), r, r);
    }
    case "ellipse":
      return ellipsePoints(
        num(el, a, "cx"),
        num(el, a, "cy"),
        num(el, a, "rx"),
        num(el, a, "ry"),
      );
    case "rect": {
      const [x, y, w, h] = [
        num(el, a, "x"),
        num(el, a, "y"),
        num(el, a, "width"),
        num(el, a, "height"),
      ];
      return [
        [x, y],
        [x + w, y],
        [x, y + h],
        [x + w, y + h],
      ];
    }
    case "line":
      return [
        [num(el, a, "x1"), num(el, a, "y1")],
        [num(el, a, "x2"), num(el, a, "y2")],
      ];
    case "polygon":
    case "polyline": {
      const n = numbers(a.get("points") ?? "");
      const out: [number, number][] = [];
      for (let k = 0; k + 1 < n.length; k += 2) out.push([n[k]!, n[k + 1]!]);
      return out;
    }
    default:
      throw new Error(`[seti] cannot measure <${el.tag}>`);
  }
}

/** Elements that paint nothing themselves (a <defs> child is drawn through a <use>). */
const NOT_RENDERED = new Set([
  "defs",
  "style",
  "title",
  "desc",
  "metadata",
  "linearGradient",
  "radialGradient",
  "stop",
]);

interface Paint {
  fill: boolean;
  stroke: boolean;
  strokeWidth: number;
  opacity: number;
}

function paintOf(parent: Paint, a: ReadonlyMap<string, string>): Paint {
  const fill = a.get("fill");
  const stroke = a.get("stroke");
  const sw = a.get("stroke-width");
  const op = a.get("opacity");
  return {
    fill: fill === undefined ? parent.fill : fill !== "none",
    stroke: stroke === undefined ? parent.stroke : stroke !== "none",
    strokeWidth:
      sw === undefined ? parent.strokeWidth : Number(sw.replace(/px$/, "")),
    opacity: parent.opacity * (op === undefined ? 1 : Number(op)),
  };
}

/**
 * The box of everything `svg` paints, in its own user units (before any
 * viewBox), or undefined when it paints nothing. `attrsOf` gives an element's
 * effective attributes (presentation attributes with CSS applied).
 */
export function paintedBox(
  svg: BBoxElement,
  attrsOf: (el: BBoxElement) => ReadonlyMap<string, string>,
): Box | undefined {
  const byId = new Map<string, BBoxElement>();
  const index = (el: BBoxElement) => {
    const id = el.attrs.get("id");
    if (id !== undefined) byId.set(id, el);
    el.children.forEach(index);
  };
  index(svg);

  let box: Box | undefined;
  const add = (x: number, y: number, pad: number) => {
    box = {
      minX: Math.min(box?.minX ?? Infinity, x - pad),
      minY: Math.min(box?.minY ?? Infinity, y - pad),
      maxX: Math.max(box?.maxX ?? -Infinity, x + pad),
      maxY: Math.max(box?.maxY ?? -Infinity, y + pad),
    };
  };

  const visit = (el: BBoxElement, m: Matrix, paint: Paint, depth: number) => {
    if (depth > 32) throw new Error("[seti] <use> nesting too deep");
    // Only what is rendered: a <defs> child is drawn through a <use>.
    if (NOT_RENDERED.has(el.tag)) return;
    const a = attrsOf(el);
    const transform = a.get("transform");
    let mm: Matrix =
      transform === undefined ? m : multiply(m, parseTransform(transform));
    const p = paintOf(paint, a);
    if (el.tag === "g" || el.tag === "svg") {
      for (const child of el.children) visit(child, mm, p, depth);
      return;
    }
    if (el.tag === "use") {
      const href = a.get("href") ?? a.get("xlink:href") ?? "";
      const target = byId.get(href.slice(1));
      if (!href.startsWith("#") || target === undefined) {
        throw new Error(`[seti] <use> of unknown "${href}"`);
      }
      mm = multiply(mm, [1, 0, 0, 1, num(el, a, "x"), num(el, a, "y")]);
      visit(target, mm, p, depth + 1);
      return;
    }
    if (p.opacity <= 0 || (!p.fill && !p.stroke)) return;
    const scale = Math.sqrt(Math.abs(mm[0] * mm[3] - mm[1] * mm[2]));
    const pad = p.stroke ? (p.strokeWidth * scale) / 2 : 0;
    for (const [x, y] of shapePoints(el, a)) {
      const [tx, ty] = apply(mm, x, y);
      add(tx, ty, pad);
    }
  };
  // The root's own presentation attributes (fill="none", a transform) apply.
  visit(
    svg,
    IDENTITY,
    { fill: true, stroke: false, strokeWidth: 1, opacity: 1 },
    0,
  );
  return box;
}
