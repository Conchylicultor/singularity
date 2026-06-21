import {
  FieldHeader,
  type FieldRendererComponent,
} from "@plugins/config_v2/plugins/fields/web";
import {
  Avatar,
  AvatarPicker,
  type AvatarSpec,
} from "@plugins/primitives/plugins/avatar/web";
import { Center } from "@plugins/primitives/plugins/css/plugins/center/web";
import { MdAdd } from "react-icons/md";
import { avatarFieldType } from "@plugins/fields/plugins/avatar/core";

const AvatarRenderer: FieldRendererComponent<AvatarSpec> = ({
  field,
  value,
  onChange,
}) => {
  // An unset avatar ({icon,color,svgNodes} all null) would render as a blank
  // muted disc with no interior — invisible against the surface. Show a dashed
  // "add" placeholder so the trigger always reads as a clickable affordance.
  const isEmpty =
    value.icon == null &&
    value.color == null &&
    (value.svgNodes == null || value.svgNodes.length === 0);

  return (
    <div className="flex items-start justify-between gap-lg py-md">
      <FieldHeader field={field} />
      <AvatarPicker
        value={value}
        onChange={(next) => onChange({ icon: next.icon, color: next.color, svgNodes: null })}
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
            size="md"
          />
        )}
      </AvatarPicker>
    </div>
  );
};
AvatarRenderer.type = avatarFieldType;

export { AvatarRenderer };
