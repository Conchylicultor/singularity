/**
 * The note layer: ONE custom Mesh for ALL notes — 4 vertices / 6 indices per
 * note, a single draw call, uint32 indices (a dense MIDI can exceed the 16k
 * notes that would overflow uint16).
 *
 * Why a mesh and not Graphics/Sprites: the whole point of the GL rewrite is
 * that resize must be O(1), not O(notes). Vertices are authored ONCE per score
 * in AUTHORED space — X in key-fractions (0..1) and Y in authored seconds,
 * exactly the {@link NoteVisual} contract from `geometry.ts` — and the parent
 * container's transform maps them to pixels (`scale = (laneWidth,
 * PX_PER_SECOND)`). A lane resize changes one container scale plus two shader
 * uniforms; the buffers never re-upload.
 *
 * Y-SIGN CONVENTION: quads are authored at y = -seconds (top = -y1Sec,
 * bottom = -y0Sec) with a POSITIVE container scale.y — the same content-space
 * convention as `geometry.ts`'s `beatToY` (y = -seconds × pxPerSec), so the
 * canvas and the DOM overlays share one formula and land pixel-exact.
 *
 * Rounded corners and the inter-note gap are computed in SCREEN PIXELS inside
 * the fragment shader (an SDF rounded-box) from the `uScale`/`uDpr` uniforms —
 * resolution- and DPR-independent with zero per-note CPU work. The fill is FLAT
 * (Synthesia-style): the white-key / black-key shade is baked into the vertex
 * color upstream (`NoteVisual.fillExpr`), so the shader just fills it. This
 * replaces the DOM version's `rounded-sm border shadow-sm` + the `w-1/h-1`
 * inset.
 *
 * The shader is deliberately MINIMAL and authored twice (GLSL for WebGL,
 * WGSL for WebGPU — Pixi v8's dual-backend requirement); keeping it to one
 * SDF + rim limits drift between the two sources.
 */
import {
  Buffer,
  BufferUsage,
  Geometry,
  Mesh,
  Shader,
  UniformGroup,
} from "pixi.js";
import { PX_PER_SECOND, type NoteVisual } from "../../components/geometry";

// --- shaders -------------------------------------------------------------------
//
// Vertex: standard Pixi v8 mesh transform (projection × world × local) with the
// quad's corner UV, authored size, and color passed through. Pixi auto-binds
// `uProjectionMatrix`/`uWorldTransformMatrix` (globals) and `uTransformMatrix`
// (local) for GL; for WGSL the `globalUniforms`/`localUniforms` binding NAMES at
// groups 0/1 are load-bearing — Pixi's mesh pipe auto-assigns those bind groups
// only when the reflected layout declares them.
//
// Fragment: maps the corner UV to a position in CSS pixels (sizePx = aSize ×
// uScale), shrinks the box by 0.5px per side (the DOM drew notes at w-1/h-1 — a
// 1px gap between adjacent notes), rounds corners at min(4px, half the min
// dimension), fills FLAT with the (already-shaded) vertex color, and
// anti-aliases over one PHYSICAL pixel (CSS px × 1/uDpr). Output is
// premultiplied alpha (Pixi's blend convention).

const GLSL_VERTEX = /* glsl */ `#version 300 es
precision highp float;

in vec2 aPosition;
in vec2 aLocal;
in vec2 aSize;
in vec4 aColor;

uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;

out vec2 vLocal;
out vec2 vSize;
out vec4 vColor;

void main() {
  mat3 mvp = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix;
  gl_Position = vec4((mvp * vec3(aPosition, 1.0)).xy, 0.0, 1.0);
  vLocal = aLocal;
  vSize = aSize;
  vColor = aColor;
}
`;

const GLSL_FRAGMENT = /* glsl */ `#version 300 es
precision mediump float;

in vec2 vLocal;
in vec2 vSize;
in vec4 vColor;

uniform vec2 uScale;
uniform float uDpr;

out vec4 finalColor;

void main() {
  vec2 sizePx = vSize * uScale;
  // 0.5px inset per side = 1px gap between adjacent notes (DOM's w-1/h-1).
  // Clamped so sub-pixel notes keep a visible ~1px core instead of vanishing.
  vec2 halfPx = max(0.5 * sizePx - 0.5, vec2(0.5));
  // Rounded pill corners (Synthesia-style).
  float radius = min(4.0, min(halfPx.x, halfPx.y));
  vec2 p = (vLocal - 0.5) * sizePx;
  // SDF rounded box, in CSS px (negative inside).
  vec2 q = abs(p) - (halfPx - vec2(radius));
  float d = length(max(q, vec2(0.0))) + min(max(q.x, q.y), 0.0) - radius;
  // One physical pixel of AA: adjacent fragments differ by 1/uDpr CSS px.
  float aa = 0.6 / uDpr;
  float coverage = 1.0 - smoothstep(-aa, aa, d);
  // Flat fill: solid Synthesia note color (the white-key / black-key shade is
  // baked into vColor upstream) — no gradient, bevel, or rim.
  float alpha = vColor.a * coverage;
  finalColor = vec4(vColor.rgb * alpha, alpha);
}
`;

const WGSL_SOURCE = /* wgsl */ `
struct GlobalUniforms {
  uProjectionMatrix: mat3x3<f32>,
  uWorldTransformMatrix: mat3x3<f32>,
  uWorldColorAlpha: vec4<f32>,
  uResolution: vec2<f32>,
}

struct LocalUniforms {
  uTransformMatrix: mat3x3<f32>,
  uColor: vec4<f32>,
  uRound: f32,
}

struct NoteUniforms {
  uScale: vec2<f32>,
  uDpr: f32,
}

@group(0) @binding(0) var<uniform> globalUniforms: GlobalUniforms;
@group(1) @binding(0) var<uniform> localUniforms: LocalUniforms;
@group(2) @binding(0) var<uniform> noteUniforms: NoteUniforms;

struct VsOut {
  @builtin(position) position: vec4<f32>,
  @location(0) vLocal: vec2<f32>,
  @location(1) vSize: vec2<f32>,
  @location(2) vColor: vec4<f32>,
}

@vertex
fn vsMain(
  @location(0) aPosition: vec2<f32>,
  @location(1) aLocal: vec2<f32>,
  @location(2) aSize: vec2<f32>,
  @location(3) aColor: vec4<f32>,
) -> VsOut {
  var o: VsOut;
  let mvp = globalUniforms.uProjectionMatrix
    * globalUniforms.uWorldTransformMatrix
    * localUniforms.uTransformMatrix;
  let pos = mvp * vec3<f32>(aPosition, 1.0);
  o.position = vec4<f32>(pos.xy, 0.0, 1.0);
  o.vLocal = aLocal;
  o.vSize = aSize;
  o.vColor = aColor;
  return o;
}

@fragment
fn fsMain(v: VsOut) -> @location(0) vec4<f32> {
  let sizePx = v.vSize * noteUniforms.uScale;
  // 0.5px inset per side = 1px gap between adjacent notes (DOM's w-1/h-1).
  let halfPx = max(0.5 * sizePx - vec2<f32>(0.5), vec2<f32>(0.5));
  // Rounded pill corners (Synthesia-style).
  let radius = min(4.0, min(halfPx.x, halfPx.y));
  let p = (v.vLocal - vec2<f32>(0.5)) * sizePx;
  // SDF rounded box, in CSS px (negative inside).
  let q = abs(p) - (halfPx - vec2<f32>(radius));
  let d = length(max(q, vec2<f32>(0.0))) + min(max(q.x, q.y), 0.0) - radius;
  // One physical pixel of AA: adjacent fragments differ by 1/uDpr CSS px.
  let aa = 0.6 / noteUniforms.uDpr;
  let coverage = 1.0 - smoothstep(-aa, aa, d);
  // Flat fill: solid Synthesia note color (the white-key / black-key shade is
  // baked into vColor upstream) — no gradient, bevel, or rim.
  let alpha = v.vColor.a * coverage;
  return vec4<f32>(v.vColor.rgb * alpha, alpha);
}
`;

export interface NoteMeshHandle {
  /** The single mesh holding every note; mount under the content-scaled layer. */
  mesh: Mesh<Geometry, Shader>;
  /** Rebuild ALL vertex/index buffers from the visuals (score change). */
  setNotes(
    visuals: readonly NoteVisual[],
    resolveColor: (expr: string) => number,
  ): void;
  /** Update the pixel-mapping uniforms (lane resize / DPR change). O(1). */
  setUniforms(scaleX: number, dpr: number): void;
  /** Rewrite ONLY the color buffer (theme flip) — geometry untouched. */
  recolor(
    visuals: readonly NoteVisual[],
    resolveColor: (expr: string) => number,
  ): void;
  destroy(): void;
}

/** Pack one note's color bytes: the resolved fill color (`fillExpr` already
 *  carries the Synthesia white-key / black-key shade), alpha = velocity-driven
 *  visual alpha. Un-premultiplied in the buffer; the fragment shader
 *  premultiplies at output. */
function writeColor(
  out: Uint8Array,
  byteOffset: number,
  visual: NoteVisual,
  resolveColor: (expr: string) => number,
): void {
  const rgb = resolveColor(visual.fillExpr);
  const r = (rgb >> 16) & 0xff;
  const g = (rgb >> 8) & 0xff;
  const b = rgb & 0xff;
  const a = Math.round(Math.max(0, Math.min(1, visual.alpha)) * 255);
  for (let corner = 0; corner < 4; corner++) {
    const o = byteOffset + corner * 4;
    out[o] = r;
    out[o + 1] = g;
    out[o + 2] = b;
    out[o + 3] = a;
  }
}

export function createNoteMesh(): NoteMeshHandle {
  // Separate buffer per attribute: `recolor` then touches exactly one upload,
  // and `setNotes` swaps `.data` wholesale (Pixi resizes the GPU buffer).
  const positionBuffer = new Buffer({
    data: new Float32Array(0),
    usage: BufferUsage.VERTEX | BufferUsage.COPY_DST,
  });
  const localBuffer = new Buffer({
    data: new Float32Array(0),
    usage: BufferUsage.VERTEX | BufferUsage.COPY_DST,
  });
  const sizeBuffer = new Buffer({
    data: new Float32Array(0),
    usage: BufferUsage.VERTEX | BufferUsage.COPY_DST,
  });
  const colorBuffer = new Buffer({
    data: new Uint8Array(0),
    usage: BufferUsage.VERTEX | BufferUsage.COPY_DST,
  });
  const indexBuffer = new Buffer({
    data: new Uint32Array(0),
    usage: BufferUsage.INDEX | BufferUsage.COPY_DST,
  });

  const geometry = new Geometry({
    attributes: {
      // Named `aPosition` (not `aPos`) so Pixi's geometry-bounds helper — which
      // looks this name up — keeps working for culling/bounds queries.
      aPosition: { buffer: positionBuffer, format: "float32x2" },
      aLocal: { buffer: localBuffer, format: "float32x2" },
      aSize: { buffer: sizeBuffer, format: "float32x2" },
      // unorm8x4 → arrives in the shader as a 0..1 vec4; 4 bytes/vertex.
      aColor: { buffer: colorBuffer, format: "unorm8x4" },
    },
    indexBuffer,
  });

  const noteUniforms = new UniformGroup({
    uScale: { value: new Float32Array([1, PX_PER_SECOND]), type: "vec2<f32>" },
    uDpr: { value: 1, type: "f32" },
  });

  const shader = Shader.from({
    gl: { vertex: GLSL_VERTEX, fragment: GLSL_FRAGMENT, name: "piano-roll-notes" },
    gpu: {
      vertex: { source: WGSL_SOURCE, entryPoint: "vsMain" },
      fragment: { source: WGSL_SOURCE, entryPoint: "fsMain" },
      name: "piano-roll-notes",
    },
    resources: { noteUniforms },
  });

  const mesh = new Mesh<Geometry, Shader>({ geometry, shader });

  return {
    mesh,

    setNotes(visuals, resolveColor) {
      const n = visuals.length;
      // An empty draw is legal but pointless — and keeps zero-sized buffers out
      // of the backends entirely.
      mesh.visible = n > 0;

      const positions = new Float32Array(n * 8);
      const locals = new Float32Array(n * 8);
      const sizes = new Float32Array(n * 8);
      const colors = new Uint8Array(n * 16);
      const indices = new Uint32Array(n * 6);

      for (let i = 0; i < n; i++) {
        const v = visuals[i]!;
        const x0 = v.xFrac;
        const x1 = v.xFrac + v.wFrac;
        // Authored content space: y = -seconds. The note END (later) is the
        // TOP (more negative), the onset is the bottom — same as the DOM rects.
        const yTop = -v.y1Sec;
        const yBottom = -v.y0Sec;
        const hSec = v.y1Sec - v.y0Sec;

        const f = i * 8;
        // Corner order: TL, TR, BR, BL — aLocal is the matching corner UV.
        positions[f] = x0; positions[f + 1] = yTop;
        positions[f + 2] = x1; positions[f + 3] = yTop;
        positions[f + 4] = x1; positions[f + 5] = yBottom;
        positions[f + 6] = x0; positions[f + 7] = yBottom;
        locals[f] = 0; locals[f + 1] = 0;
        locals[f + 2] = 1; locals[f + 3] = 0;
        locals[f + 4] = 1; locals[f + 5] = 1;
        locals[f + 6] = 0; locals[f + 7] = 1;
        for (let corner = 0; corner < 4; corner++) {
          sizes[f + corner * 2] = v.wFrac;
          sizes[f + corner * 2 + 1] = hSec;
        }
        writeColor(colors, i * 16, v, resolveColor);

        const vi = i * 4;
        const ii = i * 6;
        indices[ii] = vi; indices[ii + 1] = vi + 1; indices[ii + 2] = vi + 2;
        indices[ii + 3] = vi; indices[ii + 4] = vi + 2; indices[ii + 5] = vi + 3;
      }

      positionBuffer.data = positions;
      localBuffer.data = locals;
      sizeBuffer.data = sizes;
      colorBuffer.data = colors;
      indexBuffer.data = indices;
    },

    setUniforms(scaleX, dpr) {
      const uScale = noteUniforms.uniforms.uScale as Float32Array;
      uScale[0] = scaleX;
      uScale[1] = PX_PER_SECOND;
      noteUniforms.uniforms.uDpr = dpr;
      noteUniforms.update();
    },

    recolor(visuals, resolveColor) {
      const n = visuals.length;
      const colors = new Uint8Array(n * 16);
      for (let i = 0; i < n; i++) {
        writeColor(colors, i * 16, visuals[i]!, resolveColor);
      }
      colorBuffer.data = colors;
    },

    destroy() {
      // Destroy geometry/shader explicitly (mesh.destroy keeps shared
      // resources alive by default; ours are exclusive).
      mesh.destroy();
      geometry.destroy(true);
      shader.destroy(true);
    },
  };
}
