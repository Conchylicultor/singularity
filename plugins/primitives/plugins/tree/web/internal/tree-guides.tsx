import type { ReactNode } from "react";
import { Placed } from "@plugins/primitives/plugins/css/plugins/coords/web";

/**
 * Indent guides for one row: a hairline per ancestor level, each at
 * `--tree-guide-x` (density, default the middle) of its `--tree-indent` step of
 * the row's indent — under the chevron / icon slot of
 * the ancestor that level belongs to — in `--tree-guide` (color-palette,
 * default the border colour).
 *
 * ONE box drawing every level: a repeating background tile the width of one
 * indent step, laid over the row's indent padding (from the row's own 4px lead
 * to its first content), so the levels cannot drift from the indent they mark
 * and a depth-12 row costs the same as a depth-1 one. Each row draws its own
 * full height, so a run of rows reads as continuous lines. Decorative: it never
 * takes a click, and lives in the padding, so it moves no content and no
 * aligned column.
 */
export function TreeGuides({ depth }: { depth: number }): ReactNode {
  if (depth <= 0) return null;
  return (
    <Placed
      as="span"
      aria-hidden
      decorative
      data-tree-guides={depth}
      // The row's indent is `depth * --tree-indent + 4px`; the guides cover
      // exactly the `depth` steps after the 4px lead.
      x={{ start: 4, size: `calc(${depth} * var(--tree-indent))` }}
      y="fill"
      style={{
        backgroundImage:
          "linear-gradient(to right, transparent calc(var(--tree-guide-x) - 0.5px), var(--tree-guide) 0, var(--tree-guide) calc(var(--tree-guide-x) + 0.5px), transparent 0)",
        backgroundSize: "var(--tree-indent) 100%",
        backgroundRepeat: "repeat-x",
      }}
    />
  );
}
