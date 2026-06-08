import type { StructureFacetData } from "./types";

/** Diff projection: one entry per structural anomaly (non-standard folder,
 *  loose top-level source file, or self-declared composition root). Standard
 *  folders are conformant and excluded — only anomalies show up in PR diffs. */
export function structureToComparable(data: StructureFacetData): string[] {
  const out: string[] = [];
  for (const f of data.folders) if (!f.standard) out.push(`folder:${f.name}`);
  for (const file of data.looseFiles) out.push(`loose:${file}`);
  if (data.compositionRoot) out.push("composition-root");
  return out;
}
