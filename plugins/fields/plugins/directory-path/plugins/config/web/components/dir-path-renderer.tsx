import {
  FieldHeader,
  type FieldRendererComponent,
} from "@plugins/config_v2/plugins/fields/web";
import { FolderPickerPopover } from "@plugins/primitives/plugins/folder-picker/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { directoryPathFieldType } from "@plugins/fields/plugins/directory-path/core";

const DirPathRenderer: FieldRendererComponent<string> = ({
  field,
  value,
  onChange,
}) => (
  <Stack gap="xs" className="py-md">
    <FieldHeader field={field} />
    <FolderPickerPopover
      value={value}
      onChange={onChange}
      placeholder={field.meta.placeholder}
    />
  </Stack>
);
DirPathRenderer.type = directoryPathFieldType;

export { DirPathRenderer };
