import {
  FieldHeader,
  type FieldRendererComponent,
} from "@plugins/config_v2/plugins/fields/web";
import {
  Avatar,
  AvatarPicker,
  type AvatarSpec,
} from "@plugins/primitives/plugins/avatar/web";
import { avatarFieldType } from "@plugins/fields/plugins/avatar/core";

const AvatarRenderer: FieldRendererComponent<AvatarSpec> = ({
  field,
  value,
  onChange,
}) => {
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <FieldHeader field={field} />
      <AvatarPicker value={value} onChange={(next) => onChange({ icon: next.icon, color: next.color, svgNodes: null })}>
        <Avatar
          icon={value.icon}
          color={value.color}
          svgNodes={value.svgNodes}
          size="md"
        />
      </AvatarPicker>
    </div>
  );
};
AvatarRenderer.type = avatarFieldType;

export { AvatarRenderer };
