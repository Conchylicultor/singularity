import {
  FieldHeader,
  type FieldRendererComponent,
} from "@plugins/config_v2/plugins/fields/web";
import { FolderPickerPopover } from "@plugins/primitives/plugins/folder-picker/web";
import { directoryPathFieldType } from "@plugins/fields/plugins/directory-path/core";

const DirPathRenderer: FieldRendererComponent<string> = ({
  field,
  value,
  onChange,
}) => (
  <div className="flex flex-col gap-1.5 py-3">
    <FieldHeader field={field} />
    <FolderPickerPopover
      value={value}
      onChange={onChange}
      placeholder={field.meta.placeholder}
    />
  </div>
);
DirPathRenderer.type = directoryPathFieldType;

export { DirPathRenderer };
