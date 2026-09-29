import { useMemo, useState } from "react";
import {
  Inset,
  Stack,
} from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Surface } from "@plugins/primitives/plugins/css/plugins/surface/web";
import { clipClasses } from "@plugins/primitives/plugins/css/plugins/clip/web";
import { Placeholder } from "@plugins/primitives/plugins/css/plugins/placeholder/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import {
  BLOCK_INSET,
  blockContentScope,
  blockRowIn,
  useBlockEditor,
  useSelectionControl,
  type BlockRendererProps,
} from "@plugins/page/plugins/editor/web";
import { revealElement } from "@plugins/primitives/plugins/dom/plugins/scroll-reveal/web";
import { MapView } from "@plugins/map/web";
import { derivePageMap } from "../../core";
import { PageMap } from "../slots";

/**
 * The `/map` block: every overlay the registered layers derive from THIS page's
 * blocks, on one map.
 *
 * Nothing is stored. The overlays are recomputed from `useBlockEditor().blocks`
 * — the flat, optimistic list, collapsed toggle children included — so a place
 * picked a moment ago is on the map at once, and a deleted one is gone.
 */
export function MapBlock({ block }: BlockRendererProps) {
  const { blocks } = useBlockEditor();
  const layers = PageMap.Layer.useContributions();
  const content = blockContentScope.useScopeApi();
  const selection = useSelectionControl();
  const [activeId, setActiveId] = useState<string | null>(null);

  const view = useMemo(
    () => derivePageMap(blocks, block.pageId, layers),
    [blocks, block.pageId, layers],
  );

  function activate(overlayId: string) {
    setActiveId(overlayId);
    const blockId = view.blockIdOf.get(overlayId);
    if (blockId === undefined) return;
    // A block inside a collapsed toggle has no row: it is on the page, just
    // not on screen, so the pin stays active and nothing scrolls.
    const row = blockRowIn(content.peekRootOrThrow(), blockId);
    if (row === null) return;
    revealElement(row, { block: "center", behavior: "smooth" });
    selection?.enterSelectionMode(blockId);
  }

  return (
    <Inset x={BLOCK_INSET} y="xs">
      <Stack gap="2xs">
        <Surface
          level="raised"
          className={cn(clipClasses({ axis: "both", fill: false }), "h-80")}
        >
          <MapView
            overlays={view.overlays}
            activeId={activeId}
            onActivate={activate}
            empty={
              <Placeholder>
                {view.emptyHints.length > 0
                  ? view.emptyHints.join(" ")
                  : "Nothing on this page has a location yet."}
              </Placeholder>
            }
          />
        </Surface>
        {view.unplacedNotes.map((note) => (
          <Text key={note} variant="caption" tone="muted">
            {note}
          </Text>
        ))}
      </Stack>
    </Inset>
  );
}
