/**
 * Match a zone name against a pattern with wildcards.
 *
 * Patterns use dot-separated segments:
 *   - `*`  matches exactly one segment
 *   - `**` matches zero or more segments
 *
 * Examples:
 *   matchZone("plugin.**", "plugin.infra.events.server")  → true
 *   matchZone("plugin.*",  "plugin.infra.events")         → false (only one segment)
 *   matchZone("**.shared", "plugin.infra.events.shared")   → true
 *   matchZone("plugin.*.web", "plugin.shell.web")          → true
 */
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
      // ** at the end matches everything remaining
      if (pi === pSegs.length - 1) return true;

      // Try matching ** against 0, 1, 2, ... segments
      for (let skip = 0; skip <= zSegs.length - zi; skip++) {
        if (matchSegments(pSegs, pi + 1, zSegs, zi + skip)) return true;
      }
      return false;
    }

    if (p === "*") {
      // * matches exactly one segment
      pi++;
      zi++;
      continue;
    }

    // Literal match
    if (p !== zSegs[zi]) return false;
    pi++;
    zi++;
  }

  // Handle trailing ** that can match zero segments
  while (pi < pSegs.length && pSegs[pi] === "**") pi++;

  return pi === pSegs.length && zi === zSegs.length;
}
