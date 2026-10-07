import type { ExemptionsData } from "./types";

// Diff projection: what the plugin exempts itself from. exemptedBy is a derived
// reverse index (it depends on OTHER plugins), so it is intentionally excluded.
export function exemptionsToComparable(data: ExemptionsData): string[] {
  return data.declared.flatMap((e) =>
    e.paths.map((p) => `${e.rule} ${p} (${e.kind})`),
  );
}
