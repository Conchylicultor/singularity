import type { GeometryInvariant, MeasuredFixture } from "./types";

// The generic, PURE geometry oracle. One function per invariant kind, each
// consuming the per-width measurement map and returning a debuggable result.
// The math is ported EXACTLY from the bespoke frame geometry test
// (frame/web/internal/frame-geometry.test.ts) — that test is the source of truth
// these invariants generalize. No DOM, no Playwright: the measurement happens in
// the harness; the oracle only judges the numbers.

export type OracleResult = { ok: true } | { ok: false; detail: string };

const DEFAULT_EPSILON = 0.5;

// Sub-pixel text width drifts across OS font stacks, so every comparison is
// ε-tolerant (matching the bespoke test's `ε = 0.5` and `toBeCloseTo(_, 0)`,
// which accepts a difference < 0.5). We never assert absolute pixels.
function closeEnough(a: number, b: number, epsilon: number): boolean {
  return Math.abs(a - b) <= epsilon;
}

function widthsOf(measuredByWidth: Record<number, MeasuredFixture>): number[] {
  return Object.keys(measuredByWidth)
    .map(Number)
    .sort((a, b) => a - b);
}

function widest(measuredByWidth: Record<number, MeasuredFixture>): {
  width: number;
  m: MeasuredFixture;
} | null {
  const ws = widthsOf(measuredByWidth);
  if (ws.length === 0) return null;
  const width = ws[ws.length - 1]!;
  return { width, m: measuredByWidth[width]! };
}

// ── noOverlap ──────────────────────────────────────────────────────
// For adjacent boxes in DOM `order`, `cur.right <= next.left + ε`. Checked at
// every measured width (overlap can appear at any width). Mirrors the bespoke
// test's `expect(cur.right).toBeLessThanOrEqual(next.left + ε)`.
export function checkNoOverlap(
  measuredByWidth: Record<number, MeasuredFixture>,
  epsilon = DEFAULT_EPSILON,
): OracleResult {
  for (const width of widthsOf(measuredByWidth)) {
    const m = measuredByWidth[width]!;
    for (let i = 0; i < m.order.length - 1; i++) {
      const curId = m.order[i]!;
      const nextId = m.order[i + 1]!;
      const cur = m.slots[curId];
      const next = m.slots[nextId];
      if (!cur || !next) continue;
      if (cur.box.right > next.box.left + epsilon) {
        return {
          ok: false,
          detail: `noOverlap: at width ${width}px, slot "${curId}" (right=${cur.box.right.toFixed(1)}) overlaps "${nextId}" (left=${next.box.left.toFixed(1)}) by ${(cur.box.right - next.box.left).toFixed(1)}px (ε=${epsilon})`,
        };
      }
    }
  }
  return { ok: true };
}

// ── noClip ─────────────────────────────────────────────────────────
// Every slot box stays within `container` ± ε, at every measured width. Mirrors
// the bespoke test's left ≥ container.left − ε and right ≤ container.right + ε.
export function checkNoClip(
  measuredByWidth: Record<number, MeasuredFixture>,
  epsilon = DEFAULT_EPSILON,
): OracleResult {
  for (const width of widthsOf(measuredByWidth)) {
    const m = measuredByWidth[width]!;
    for (const id of m.order) {
      const slot = m.slots[id];
      if (!slot) continue;
      if (slot.box.left < m.container.left - epsilon) {
        return {
          ok: false,
          detail: `noClip: at width ${width}px, slot "${id}" (left=${slot.box.left.toFixed(1)}) clips past container left (${m.container.left.toFixed(1)}) by ${(m.container.left - slot.box.left).toFixed(1)}px (ε=${epsilon})`,
        };
      }
      if (slot.box.right > m.container.right + epsilon) {
        return {
          ok: false,
          detail: `noClip: at width ${width}px, slot "${id}" (right=${slot.box.right.toFixed(1)}) clips past container right (${m.container.right.toFixed(1)}) by ${(slot.box.right - m.container.right).toFixed(1)}px (ε=${epsilon})`,
        };
      }
    }
  }
  return { ok: true };
}

// ── leftPack ───────────────────────────────────────────────────────
// `slots[slot].box.left ≈ slots[after].box.right + gap` (within ε). Asserts a
// slot is left-packed immediately after another (one gap, no extra slack — the
// no-meta centering regression pooled leftover into rigid tracks, shoving the
// content slot toward center). Mirrors `content.left ≈ leading.right + 8`.
// Checked at every width where both slots are present.
export function checkLeftPack(
  measuredByWidth: Record<number, MeasuredFixture>,
  after: string,
  slot: string,
  gap: number,
  epsilon = DEFAULT_EPSILON,
): OracleResult {
  let seen = false;
  for (const width of widthsOf(measuredByWidth)) {
    const m = measuredByWidth[width]!;
    const afterBox = m.slots[after];
    const slotBox = m.slots[slot];
    if (!afterBox || !slotBox) continue;
    seen = true;
    const expected = afterBox.box.right + gap;
    if (!closeEnough(slotBox.box.left, expected, epsilon)) {
      return {
        ok: false,
        detail: `leftPack: at width ${width}px, slot "${slot}" (left=${slotBox.box.left.toFixed(1)}) is not packed ${gap}px after "${after}" (right=${afterBox.box.right.toFixed(1)}, expected left≈${expected.toFixed(1)}, off by ${(slotBox.box.left - expected).toFixed(1)}px, ε=${epsilon})`,
      };
    }
  }
  if (!seen) {
    return {
      ok: false,
      detail: `leftPack: slots "${after}" and/or "${slot}" never both present across the width sweep`,
    };
  }
  return { ok: true };
}

// ── rigidIntegrity ─────────────────────────────────────────────────
// The slot's width is STABLE across all swept widths (max − min ≤ ε). This is
// the measured-stable generalization of the bespoke test's `leading.width ≈
// LEADING_W` / `trailing.width ≈ TRAILING_W` — but instead of pinning a magic
// hand-built constant, it measures the REAL component and asserts the rigid
// cluster never crushes as the row narrows.
export function checkRigidIntegrity(
  measuredByWidth: Record<number, MeasuredFixture>,
  slot: string,
  epsilon = DEFAULT_EPSILON,
): OracleResult {
  const widthsSeen: { containerWidth: number; slotWidth: number }[] = [];
  for (const width of widthsOf(measuredByWidth)) {
    const m = measuredByWidth[width]!;
    const box = m.slots[slot];
    if (!box) continue;
    widthsSeen.push({ containerWidth: width, slotWidth: box.box.width });
  }
  if (widthsSeen.length === 0) {
    return {
      ok: false,
      detail: `rigidIntegrity: slot "${slot}" never present across the width sweep`,
    };
  }
  const widthsArr = widthsSeen.map((w) => w.slotWidth);
  const min = Math.min(...widthsArr);
  const max = Math.max(...widthsArr);
  if (max - min > epsilon) {
    const minAt = widthsSeen.find((w) => w.slotWidth === min)!;
    const maxAt = widthsSeen.find((w) => w.slotWidth === max)!;
    return {
      ok: false,
      detail: `rigidIntegrity: slot "${slot}" width is NOT stable across the sweep — ${min.toFixed(1)}px (at container ${minAt.containerWidth}px) → ${max.toFixed(1)}px (at container ${maxAt.containerWidth}px), spread ${(max - min).toFixed(1)}px > ε=${epsilon}`,
    };
  }
  return { ok: true };
}

// ── pinnedRight ────────────────────────────────────────────────────
// `slots[slot].box.right ≈ container.right` (± ε), evaluated at the WIDEST
// width only (where the leftover the fill track must absorb actually exists; at
// the narrowest width the row may be crushed flush). Mirrors the bespoke test's
// `trailing.right ≈ container.right`.
export function checkPinnedRight(
  measuredByWidth: Record<number, MeasuredFixture>,
  slot: string,
  epsilon = DEFAULT_EPSILON,
): OracleResult {
  const w = widest(measuredByWidth);
  if (!w) {
    return { ok: false, detail: `pinnedRight: no measured widths for slot "${slot}"` };
  }
  const box = w.m.slots[slot];
  if (!box) {
    return {
      ok: false,
      detail: `pinnedRight: slot "${slot}" absent at widest width ${w.width}px`,
    };
  }
  if (!closeEnough(box.box.right, w.m.container.right, epsilon)) {
    return {
      ok: false,
      detail: `pinnedRight: at widest width ${w.width}px, slot "${slot}" (right=${box.box.right.toFixed(1)}) is not pinned to container right (${w.m.container.right.toFixed(1)}, off by ${(w.m.container.right - box.box.right).toFixed(1)}px, ε=${epsilon})`,
    };
  }
  return { ok: true };
}

// ── neverTruncatesWhenRoomy ────────────────────────────────────────
// At the widest width, every listed slot has `truncates === false`. This is the
// "neither truncates when roomy" precondition the strict-priority oracle relies
// on (the bespoke test's `roomyTruncates.{content,meta} === false`).
export function checkNeverTruncatesWhenRoomy(
  measuredByWidth: Record<number, MeasuredFixture>,
  slots: string[],
): OracleResult {
  const w = widest(measuredByWidth);
  if (!w) {
    return { ok: false, detail: `neverTruncatesWhenRoomy: no measured widths` };
  }
  for (const id of slots) {
    const box = w.m.slots[id];
    if (!box) {
      return {
        ok: false,
        detail: `neverTruncatesWhenRoomy: slot "${id}" absent at widest width ${w.width}px`,
      };
    }
    if (box.truncates) {
      return {
        ok: false,
        detail: `neverTruncatesWhenRoomy: slot "${id}" truncates even at the widest width ${w.width}px (should have room)`,
      };
    }
  }
  return { ok: true };
}

// ── truncationOnsetOrder ───────────────────────────────────────────
// onset(id) = the WIDEST container width at which `slots[id].truncates` is first
// true across the sweep. Strict priority means `first` must reach the truncating
// state at a WIDER width than `last` (first gives up characters earlier), and
// BOTH must truncate somewhere in the sweep. Mirrors the bespoke test's
// `truncationThresholds` + `metaAt > contentAt > 0`.
function truncationOnset(
  measuredByWidth: Record<number, MeasuredFixture>,
  id: string,
): number {
  // Widest width at which the slot first enters the truncating state.
  let onset = -1;
  for (const width of widthsOf(measuredByWidth)) {
    const slot = measuredByWidth[width]!.slots[id];
    if (slot?.truncates) onset = Math.max(onset, width);
  }
  return onset;
}

export function checkTruncationOnsetOrder(
  measuredByWidth: Record<number, MeasuredFixture>,
  first: string,
  last: string,
): OracleResult {
  const firstAt = truncationOnset(measuredByWidth, first);
  const lastAt = truncationOnset(measuredByWidth, last);
  if (firstAt <= 0) {
    return {
      ok: false,
      detail: `truncationOnsetOrder: slot "${first}" never truncates across the width sweep (onset=${firstAt}); expected it to truncate first`,
    };
  }
  if (lastAt <= 0) {
    return {
      ok: false,
      detail: `truncationOnsetOrder: slot "${last}" never truncates across the width sweep (onset=${lastAt}); expected it to truncate (last)`,
    };
  }
  if (!(firstAt > lastAt)) {
    return {
      ok: false,
      detail: `truncationOnsetOrder: slot "${first}" (onset=${firstAt}px) does not truncate before "${last}" (onset=${lastAt}px) — strict priority requires onset("${first}") > onset("${last}")`,
    };
  }
  return { ok: true };
}

// ── evaluateInvariant (dispatcher) ─────────────────────────────────
//
// `falsification` is NOT evaluated here. The test harness handles it specially:
// it re-renders the construct with the mutation applied and asserts the inner
// `expectViolated` invariant is VIOLATED (the oracle has teeth). Evaluating it
// in this pure dispatcher (which only sees the unmutated measurement) would be
// meaningless, so it returns a no-op `{ ok: true }`.
export function evaluateInvariant(
  inv: GeometryInvariant,
  measuredByWidth: Record<number, MeasuredFixture>,
): OracleResult {
  switch (inv.kind) {
    case "noOverlap":
      return checkNoOverlap(measuredByWidth, inv.epsilon);
    case "noClip":
      return checkNoClip(measuredByWidth, inv.epsilon);
    case "leftPack":
      return checkLeftPack(measuredByWidth, inv.after, inv.slot, inv.gap, inv.epsilon);
    case "rigidIntegrity":
      return checkRigidIntegrity(measuredByWidth, inv.slot, inv.epsilon);
    case "pinnedRight":
      return checkPinnedRight(measuredByWidth, inv.slot, inv.epsilon);
    case "neverTruncatesWhenRoomy":
      return checkNeverTruncatesWhenRoomy(measuredByWidth, inv.slots);
    case "truncationOnsetOrder":
      return checkTruncationOnsetOrder(measuredByWidth, inv.first, inv.last);
    case "falsification":
      // Handled specially by the suite (re-render mutated → assert violation).
      return { ok: true };
  }
}
