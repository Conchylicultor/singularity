import type { FieldRendererComponent } from "@plugins/config_v2/plugins/fields/web";
import {
  Avatar,
  AvatarPicker,
  type AvatarSpec,
} from "@plugins/primitives/plugins/avatar/web";
import { avatarFieldType } from "../../core";

const AvatarRenderer: FieldRendererComponent<AvatarSpec> = ({
  field,
  value,
  onChange,
}) => {
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <div className="flex flex-col gap-0.5">
        {field.meta.label ? (
          <label className="text-sm font-medium">{field.meta.label}</label>
        ) : null}
        {field.meta.description ? (
          <p className="text-xs text-muted-foreground">
            {field.meta.description}
          </p>
        ) : null}
      </div>
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
