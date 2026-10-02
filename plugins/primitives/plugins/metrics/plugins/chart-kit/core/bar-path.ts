/**
 * The SVG path of one bar centred on `x`, `w` wide, growing from the baseline
 * `yBase` to the data end `yEnd`: the data end is rounded with radius `r`, the
 * baseline end stays square. Works both ways — `yEnd < yBase` grows up,
 * `yEnd > yBase` grows down. A bar under half a pixel tall draws nothing (`""`).
 * The radius is clamped to the bar's height and half its width, so a tiny bar
 * is a rounded sliver, never a self-intersecting path.
 */
export function barPath(
  x: number,
  w: number,
  yBase: number,
  yEnd: number,
  r: number,
): string {
  const h = Math.abs(yBase - yEnd);
  if (h < 0.5 || w <= 0) return "";
  const rr = Math.max(0, Math.min(r, h, w / 2));
  const left = x - w / 2;
  const right = x + w / 2;
  const toward = yEnd < yBase ? rr : -rr;
  return (
    `M${left},${yBase}V${yEnd + toward}` +
    `Q${left},${yEnd} ${left + rr},${yEnd}` +
    `H${right - rr}` +
    `Q${right},${yEnd} ${right},${yEnd + toward}` +
    `V${yBase}Z`
  );
}

/**
 * A bar growing from `zeroY` to `endY` that starts `gap` px off the zero line —
 * the 2px surface gap between stacked segments, the 1px lift of mirror / net
 * bars off their zero line. A value too small to clear the gap draws nothing
 * (`""`), never a bar flipped to the wrong side of the line.
 */
export function offsetBarPath(
  x: number,
  w: number,
  zeroY: number,
  endY: number,
  gap: number,
  r: number,
): string {
  const up = endY < zeroY;
  const yBase = up ? zeroY - gap : zeroY + gap;
  if (up ? endY >= yBase : endY <= yBase) return "";
  return barPath(x, w, yBase, endY, r);
}
