import { Button } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { RegenerateIconAction } from "@plugins/apps/plugins/pages/plugins/auto-icon/web";
import type { ComponentProps } from "react";
import { symbol, type IconRef } from "@plugins/ui/plugins/icons/core";
import { Icon } from "@plugins/ui/plugins/icons/web";
import { pageData } from "@plugins/page/plugins/editor/core";
import type { PageHeaderPartProps as PartProps } from "../slots";
import { useSavePageData } from "../internal/use-save-page-data";
import { ChangeCoverPopover } from "./change-cover-popover";
import { PageIconPicker, type PageIconFooterActions } from "./page-icon-button";

const imageIcon = symbol("image");
const moodIcon = symbol("mood");

// The page-tree's own `PageDetail.HeaderTool` contributions: the quiet ghost
// buttons in the hover row above the title. Each is handed the open page by the
// header and gates on what the page already has, so the row only ever offers
// what would change something.

/** The icon picker's footer: Regenerate beside Remove. */
function iconFooter(pageId: string): PageIconFooterActions {
  return () => <RegenerateIconAction pageId={pageId} />;
}

function HeaderToolButton({
  icon,
  label,
  ...rest
}: {
  icon: IconRef;
  label: string;
} & ComponentProps<typeof Button>) {
  return (
    <Button variant="ghost" className="text-muted-foreground" {...rest}>
      <Icon icon={icon} />
      {label}
    </Button>
  );
}

/** "Add icon" — offered while the page has none. */
export function AddIconTool({ pageId, page }: PartProps) {
  const save = useSavePageData(page);
  return (
    <PageIconPicker
      value={{ icon: null }}
      onChange={(next) => save({ icon: next.icon })}
      footerActions={iconFooter(pageId)}
      trigger={<HeaderToolButton icon={moodIcon} label="Add icon" />}
    />
  );
}

export function useHasNoIcon({ page }: PartProps): boolean {
  return pageData(page).icon == null;
}

/** "Change icon" — the same picker, offered once the page has an icon. */
export function ChangeIconTool({ pageId, page }: PartProps) {
  const save = useSavePageData(page);
  return (
    <PageIconPicker
      value={{ icon: pageData(page).icon ?? null }}
      onChange={(next) => save({ icon: next.icon })}
      footerActions={iconFooter(pageId)}
      trigger={<HeaderToolButton icon={moodIcon} label="Change icon" />}
    />
  );
}

export function useHasIcon({ page }: PartProps): boolean {
  return pageData(page).icon != null;
}

/** "Add cover" — offered while the page has none (a cover has its own
 *  Change control on the cover itself). */
export function AddCoverTool({ page }: PartProps) {
  const save = useSavePageData(page);
  return (
    <ChangeCoverPopover
      current={null}
      onPick={(cover) => save({ cover })}
      trigger={<HeaderToolButton icon={imageIcon} label="Add cover" />}
    />
  );
}

export function useHasNoCover({ page }: PartProps): boolean {
  return pageData(page).cover == null;
}
