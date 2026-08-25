import { defineFieldShape } from "@plugins/config_v2/plugins/fields/web";
import { avatarFieldType } from "@plugins/fields/plugins/avatar/core";
import { Avatar, AvatarPicker } from "@plugins/primitives/plugins/avatar/web";
import { Center } from "@plugins/primitives/plugins/css/plugins/center/web";
import { MdAdd } from "react-icons/md";

/** A disc sizes to itself, so it takes the row's value cell `inline`. */
const AvatarRenderer = defineFieldShape({
  type: avatarFieldType,
  useShape: ({ value, onChange }) => {
    // An unset avatar ({icon,color,svgNodes} all null) would render as a blank
    // muted disc with no interior — invisible against the surface. Show a dashed
    // "add" placeholder so the trigger always reads as a clickable affordance.
    const isEmpty =
      value.icon == null &&
      value.color == null &&
      (value.svgNodes == null || value.svgNodes.length === 0);
    return {
      kind: "value",
      fit: "inline",
      control: (
        <AvatarPicker
          value={value}
          onChange={(next) =>
            onChange({ icon: next.icon, color: next.color, svgNodes: null })
          }
        >
          {isEmpty ? (
            <Center
              as="span"
              className="size-8 rounded-full border border-dashed border-border text-muted-foreground transition-colors hover:border-ring hover:text-foreground"
            >
              <MdAdd className="size-4" />
            </Center>
          ) : (
            <Avatar
              icon={value.icon}
              color={value.color}
              svgNodes={value.svgNodes}
            />
          )}
        </AvatarPicker>
      ),
    };
  },
});

export { AvatarRenderer };
