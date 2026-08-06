import {
  parseLineagePath,
  type LineageNode,
} from "@plugins/primitives/plugins/ui-context/core";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";

/**
 * The composition lineage, one node per line.
 *
 * The flat `a@b > c@d > e@f` form is right for the wire (the agent reads it as
 * prose, and the tag must stay single-line for the editor's markdown sync) and
 * wrong for a human: reflowed into a paragraph, the node boundaries land
 * wherever the wrap does. So the chip parses it back through `parseLineagePath`
 * — the formatter's inverse, kept beside it in `ui-context` core — and gives
 * each node its own line.
 *
 * Deliberately FLAT: every line starts at the same x, inside the value column
 * of the popover's label/value grid. Progressive per-row indentation was tried
 * and reverted — depth is already given by line order, and the extra ladder
 * fought the grid (and re-broke alignment whenever a long node wrapped). Same
 * reason the coloring is a plain two-tone rhythm (plugin bright, slot dim) and
 * nothing else: a third tone reads as noise, not as structure.
 */
export function LineagePath({ path }: { path: string }) {
  return (
    // The flat form stays reachable on hover — it is what an agent will see.
    <Stack gap="none" title={path}>
      {parseLineagePath(path).map((node, i) => (
        <LineageRow key={i} node={node} />
      ))}
    </Stack>
  );
}

function LineageRow({ node }: { node: LineageNode }) {
  return (
    <Stack direction="row" gap="2xs" wrap>
      {node.kind === "contribution" ? (
        <>
          <Text variant="caption">{node.pluginId}</Text>
          {node.slotId && (
            // Arrow + slot travel as one unit so a wrap never strands the glyph
            // on its own line — and so the slot id is its own text leaf.
            <Stack direction="row" gap="2xs">
              <Text variant="caption" tone="muted" aria-hidden>
                →
              </Text>
              <Text variant="caption" tone="muted">
                {node.slotId}
              </Text>
            </Stack>
          )}
        </>
      ) : (
        <>
          {/* Plugin id leads, as it does in the serialized form, so every line
              of the chain starts with the same kind of thing. */}
          {node.pluginId && <Text variant="caption">{node.pluginId}</Text>}
          <Text variant="caption" tone="muted">
            in {node.regionKind}
          </Text>
          <Text variant="caption">{node.id}</Text>
          {node.label && (
            <Text variant="caption" tone="muted">
              ({node.label})
            </Text>
          )}
        </>
      )}
    </Stack>
  );
}
