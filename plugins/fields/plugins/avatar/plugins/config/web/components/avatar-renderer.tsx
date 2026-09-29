import { defineFieldShape } from "@plugins/config_v2/plugins/fields/web";
import { avatarFieldType } from "@plugins/fields/plugins/avatar/core";
import { Avatar, AvatarPicker } from "@plugins/primitives/plugins/avatar/web";
import { Center } from "@plugins/primitives/plugins/css/plugins/center/web";

import { symbol } from "@plugins/ui/plugins/icons/core";
import { Icon } from "@plugins/ui/plugins/icons/web";

const addIcon = symbol("add");

/** A disc sizes to itself, so it takes the row's value cell `inline`. */
const AvatarRenderer = defineFieldShape({
  type: avatarFieldType,
  useShape: ({ value, onChange }) => {
    // An unset avatar ({icon,color} both null) would render as a blank muted
    // disc with no interior — invisible against the surface. Show a dashed
    // "add" placeholder so the trigger always reads as a clickable affordance.
    const isEmpty = value.icon == null && value.color == null;
    return {
      kind: "value",
      fit: "inline",
      control: (
        <AvatarPicker
          value={value}
          onChange={(next) => onChange({ icon: next.icon, color: next.color })}
        >
          {isEmpty ? (
            <Center
              as="span"
              className="size-8 rounded-full border border-dashed border-border text-muted-foreground transition-colors hover:border-ring hover:text-foreground"
            >
              <Icon icon={addIcon} className="size-4" />
            </Center>
          ) : (
            <Avatar icon={value.icon} color={value.color} />
          )}
        </AvatarPicker>
      ),
    };
  },
});

export { AvatarRenderer };
