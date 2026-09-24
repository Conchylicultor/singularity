import {
  cn,
  DropdownMenu,
  DropdownMenuTrigger,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Line } from "@plugins/primitives/plugins/css/plugins/line/web";
import {
  Fill,
  fillClasses,
} from "@plugins/primitives/plugins/css/plugins/fill/web";
import { IconButton } from "@plugins/primitives/plugins/icon-button/web";
import { MdExpandMore, MdPlayArrow } from "react-icons/md";
import { StatusDot } from "@plugins/primitives/plugins/css/plugins/status-dot/web";
import {
  LaunchModelMenuContent,
  useLaunchConversation,
} from "@plugins/primitives/plugins/launch/web";
import { choiceLabel } from "@plugins/conversations/plugins/model-provider/core";
import { useDefaultModel } from "@plugins/conversations/plugins/model-provider/web";

/**
 * The new-conversation launch control as a sidebar nav row: a model picker —
 * a bordered, filled box led by an accent dot — and, a small gap away, a
 * square launch button in the same fill. Built from `SidebarMenuButton` chrome
 * so it keeps the nav links' height, font and icon sizing. (Rendering
 * `LaunchControl` here would import the page-canvas `Button` density and
 * typography into the nav rail, which is why the composition is local; the
 * launch *behavior* and the model menu still come from the primitive, via
 * `useLaunchConversation` + `LaunchModelMenuContent`.)
 *
 * `Line` is the outer container for its `whitespace-nowrap`: the shadcn
 * `SidebarMenuButton` carries `overflow-hidden` WITHOUT it, so on a narrow rail
 * the label would wrap to a second line and the clip would hide the overflow
 * rather than the wrap (the exact trap `no-clip-without-nowrap` describes).
 */
export function LaunchSidebarItem() {
  const { launch, launching } = useLaunchConversation({});
  const defaultModel = useDefaultModel();
  const label = choiceLabel(defaultModel);

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <Line className="gap-xs">
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <SidebarMenuButton
                  className={cn(
                    fillClasses("x"),
                    "border border-sidebar-border bg-sidebar-accent font-semibold",
                  )}
                />
              }
            >
              <StatusDot colorClass="bg-primary" />
              <span>{label}</span>
              <Fill />
              <MdExpandMore className="opacity-60" />
            </DropdownMenuTrigger>
            <LaunchModelMenuContent launch={launch} />
          </DropdownMenu>
          <IconButton
            icon={MdPlayArrow}
            label={`Launch ${label}`}
            variant="ghost"
            disabled={launching !== null}
            onClick={() => launch(defaultModel)}
            // The nav rows' `rounded-md`, in the picker's fill, with the
            // accent on the glyph only.
            className="rounded-md bg-sidebar-accent text-primary"
          />
        </Line>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
