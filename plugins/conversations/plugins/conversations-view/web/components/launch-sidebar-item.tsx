import {
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
 * The new-conversation launch control as a sidebar nav row, built from the SAME
 * `SidebarMenuButton` chrome as the nav links — identical height, font, icon
 * sizing, and hover by construction. The button (the flexible cell) opens the
 * shared model menu; the rigid trailing `IconButton` (auto-pending while the
 * launch promise is in flight) launches the current default model. Real tracks,
 * never an absolute trailing affordance.
 */
export function LaunchSidebarItem() {
  const { launch, launching } = useLaunchConversation({});
  const defaultModel = useDefaultModel();
  const label = MODEL_REGISTRY[defaultModel].label;

  return (
    <SidebarMenu className="px-sm">
      <SidebarMenuItem>
        <Line>
          <Fill>
            <DropdownMenu>
              <DropdownMenuTrigger render={<SidebarMenuButton />}>
                <MdAdd />
                <span>{label}</span>
                <Fill />
                <MdExpandMore className="opacity-60" />
              </DropdownMenuTrigger>
              <LaunchModelMenuContent launch={launch} />
            </DropdownMenu>
          </Fill>
          <IconButton
            icon={MdPlayArrow}
            label={`Launch ${label}`}
            variant="ghost"
            disabled={launching !== null}
            onClick={() => launch(defaultModel)}
          />
        </Line>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
