import type { IconRef } from "@plugins/ui/plugins/icons/core";
import { Icon } from "@plugins/ui/plugins/icons/web";
import { Row } from "@plugins/primitives/plugins/css/plugins/row/web";

/**
 * How loud a sidebar action row reads: `muted` for a quiet create affordance
 * ("New page"), `default` for a destination in the body colour ("Trash").
 */
export type PagesSidebarRowTone = "muted" | "default";

const TONE_CLASS: Record<PagesSidebarRowTone, string> = {
  muted: "text-muted-foreground",
  default: "text-foreground",
};

/**
 * A Pages sidebar action row ("New page", "Trash"): the sidebar's row height
 * (`sidebarRowHeight`), a sidebar-sized icon, and its tone's text colour, on
 * the sidebar's rail — so the footer's rows line up with the page tree's rows
 * above them. The one rendering of such a row, so the footer's entries cannot
 * drift apart.
 */
export function PagesSidebarRow({
  icon,
  label,
  onClick,
  disabled,
  tone,
}: {
  icon: IconRef;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  tone: PagesSidebarRowTone;
}) {
  return (
    // `pt-2xs`: the mockup's 2px between the sidebar's stacked items.
    <div className="rail-follow pt-2xs">
      <Row
        icon={<Icon icon={icon} className="size-sidebar-icon" />}
        disabled={disabled}
        onClick={onClick}
        className={`h-sidebar-row ${TONE_CLASS[tone]}`}
      >
        {label}
      </Row>
    </div>
  );
}
