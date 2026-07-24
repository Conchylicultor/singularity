import {
  ButtonGroup,
  DropdownMenu,
  DropdownMenuTrigger,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Line } from "@plugins/primitives/plugins/css/plugins/line/web";
import { Fill } from "@plugins/primitives/plugins/css/plugins/fill/web";
import { IconButton } from "@plugins/primitives/plugins/icon-button/web";
import { MdAdd, MdExpandMore, MdPlayArrow } from "react-icons/md";
import {
  LaunchModelMenuContent,
  useLaunchConversation,
} from "@plugins/primitives/plugins/launch/web";
import { MODEL_REGISTRY } from "@plugins/conversations/plugins/model-provider/core";
import { useDefaultModel } from "@plugins/conversations/plugins/model-provider/web";

/**
 * The new-conversation launch control as a sidebar nav row: the same split
 * `[ model dropdown | launch ]` shape as the shared `LaunchControl`, but built
 * from `SidebarMenuButton` chrome so it matches the nav links beside it —
 * identical height, font, icon sizing, and hover by construction. (Rendering
 * `LaunchControl` here would import the page-canvas `Button` density and
 * typography into the nav rail, which is why the composition is local; the
 * launch *behavior* and the model menu still come from the primitive, via
 * `useLaunchConversation` + `LaunchModelMenuContent`.)
 *
 * `ButtonGroup` is what makes the two halves read as ONE split control rather
 * than two adjacent buttons: it squares the inner corners and collapses the
 * doubled border into a single seam, exactly as it does for `LaunchControl`. It
 * is a pure layout primitive — it neither clones children nor injects props, so
 * a `SidebarMenuButton` (via the dropdown trigger's `render`) and an
 * `IconButton` are both valid direct children; each renders exactly one DOM
 * element, which is what the `[&>*:not(:first-child)]` seam selectors need.
 *
 * `Line` stays as the outer container for its `whitespace-nowrap`: the shadcn
 * `SidebarMenuButton` carries `overflow-hidden` WITHOUT it, so on a narrow rail
 * the label would wrap to a second line and the clip would hide the overflow
 * rather than the wrap (the exact trap `no-clip-without-nowrap` describes).
 */
export function LaunchSidebarItem() {
  const { launch, launching } = useLaunchConversation({});
  const defaultModel = useDefaultModel();
  const label = MODEL_REGISTRY[defaultModel].label;

  return (
    <SidebarMenu className="px-sm">
      <SidebarMenuItem>
        <Line>
          <ButtonGroup className="w-full">
            <DropdownMenu>
              <DropdownMenuTrigger render={<SidebarMenuButton />}>
                <MdAdd />
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
              // Match the sidebar nav rows' `rounded-md`; `Button`'s own base is
              // `rounded-lg`, which would leave the group's two outer corners at
              // different radii.
              className="rounded-md"
            />
          </ButtonGroup>
        </Line>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
