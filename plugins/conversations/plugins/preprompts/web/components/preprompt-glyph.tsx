import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import type { AvatarSpec } from "@plugins/fields/plugins/avatar/core";
import { runtimeSymbol, symbol } from "@plugins/ui/plugins/icons/core";
import { Icon } from "@plugins/ui/plugins/icons/web";

const campaignIcon = symbol("campaign");

// Renders a preprompt's icon as a bare, muted glyph (no coloured disc): the
// picked Material Symbols name as a runtime symbol. When the spec carries no
// icon a default glyph (campaign) renders, so a preprompt is *always* visibly
// marked. This is the single source of the preprompt marker look — the picker
// and the conversation snapshot chip both render through it so the marker reads
// identically everywhere. The picked colour is intentionally dropped: markers
// read as neutral status, not as a coloured label.
export function PrepromptGlyph({
  icon,
  className,
}: {
  icon: AvatarSpec | null | undefined;
  className?: string;
}) {
  const name = icon?.icon;
  return (
    <Icon
      icon={name != null ? runtimeSymbol(name) : campaignIcon}
      aria-hidden
      // eslint-disable-next-line layout/no-adhoc-layout -- rigid leaf glyph; must not shrink inside the select/chip flex rows that host it
      className={cn("size-3.5 shrink-0", className)}
    />
  );
}
