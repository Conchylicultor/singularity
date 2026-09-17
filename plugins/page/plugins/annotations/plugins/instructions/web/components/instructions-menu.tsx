import type { Block } from "@plugins/page/plugins/editor/core";
import type { BlockEditorAPI } from "@plugins/page/plugins/editor/web";
import { ControlPanel } from "@plugins/primitives/plugins/css/plugins/control-panel/web";
import { instructionsBlock } from "../../core";

/**
 * The instructions card's section in the rail's block-actions menu
 * (`BlockFrameMeta.menu`), above the generic structural actions (Collapse /
 * Remove Instructions / Delete) that menu supplies for every container.
 *
 * One switch, **Global**: on, the card's body is handed to every agent
 * conversation at its start; off, it reaches only agents working under the page
 * it sits on. The write is the card's own data (`api.update`), carried WHOLE —
 * `BlockEditorAPI` replaces a block's `data` rather than merging into it. The
 * menu stays open, like the callout's swatches: flipping it is a setting, and the
 * switch shows the new state in place.
 */
export function InstructionsMenu({
  block,
  api,
}: {
  block: Block;
  api: BlockEditorAPI;
  close: () => void;
}) {
  const parsed = instructionsBlock.safeParse(block.data);
  const global = parsed.success && parsed.data.global === true;
  return (
    <ControlPanel.Section>
      <ControlPanel.Row
        select="switch"
        checked={global}
        hint="Hand this card to every agent conversation at its start, wherever it works."
        onSelect={() => {
          api.update(global ? {} : { global: true });
        }}
      >
        Global
      </ControlPanel.Row>
    </ControlPanel.Section>
  );
}
