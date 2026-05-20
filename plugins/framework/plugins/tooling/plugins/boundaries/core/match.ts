export function matchZone(pattern: string, zone: string): boolean {
  const pSegs = pattern.split(".");
  const zSegs = zone.split(".");
  return matchSegments(pSegs, 0, zSegs, 0);
}

function matchSegments(
  pSegs: string[],
  pi: number,
  zSegs: string[],
  zi: number,
): boolean {
  while (pi < pSegs.length && zi < zSegs.length) {
    const p = pSegs[pi]!;

    if (p === "**") {
      if (pi === pSegs.length - 1) return true;

      for (let skip = 0; skip <= zSegs.length - zi; skip++) {
        if (matchSegments(pSegs, pi + 1, zSegs, zi + skip)) return true;
      }
      return false;
    }

    if (p === "*") {
      pi++;
      zi++;
      continue;
    }

    if (p !== zSegs[zi]) return false;
    pi++;
    zi++;
  }

  while (pi < pSegs.length && pSegs[pi] === "**") pi++;

  return pi === pSegs.length && zi === zSegs.length;
}
