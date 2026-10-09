import { IconButton } from "@plugins/primitives/plugins/icon-button/web";
import { useDraft } from "@plugins/primitives/plugins/persistent-draft/web";
import { symbol } from "@plugins/ui/plugins/icons/core";

const rightPanelIcon = symbol("right-panel-open");

/**
 * Whether the player's section column is hidden — one device-local choice
 * (`useDraft`, so every reader stays in sync within and across tabs), read by
 * the column itself (`SectionPane`, which renders nothing while collapsed) and
 * flipped by the header's Panels toggle. The key is the one the column has
 * always persisted under, so an existing choice survives the move.
 */
export function useSectionPaneCollapsed() {
  return useDraft("sonata.section-pane.collapsed", false);
}

/**
 * The player header's **Panels** toggle (`sonataPlayerPane.Actions`, id
 * `panels`): shows or hides the song's section column. Pressed while the column
 * is open. It lives in the header rather than in the column so that hiding the
 * column leaves nothing behind it — the display takes the whole width.
 */
export function PanelsToggle() {
  const [collapsed, setCollapsed] = useSectionPaneCollapsed();
  const open = !collapsed;
  return (
    <IconButton
      icon={rightPanelIcon}
      label="Song panels"
      active={open}
      aria-pressed={open}
      onClick={() => setCollapsed(open)}
    />
  );
}
