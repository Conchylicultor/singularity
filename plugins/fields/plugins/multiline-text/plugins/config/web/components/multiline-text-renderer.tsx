import {
  FieldHeader,
  useLocalValue,
  type FieldRendererComponent,
} from "@plugins/config_v2/plugins/fields/web";
import { multilineTextFieldType } from "@plugins/fields/plugins/multiline-text/core";
import { type MultilineTextFieldDef } from "../../core";

const MultilineTextRenderer: FieldRendererComponent<string> = ({
  field,
  value,
  onChange,
}) => {
  const { local, setLocal, focus } = useLocalValue(value);
  const rows = (field as MultilineTextFieldDef).rows ?? 4;
  return (
    <div className="flex flex-col gap-1.5 py-3">
      <FieldHeader field={field} />
      <textarea
        value={local}
        rows={rows}
        placeholder={field.meta.placeholder}
        onFocus={focus.onFocus}
        onBlur={() => {
          focus.onBlur();
          if (local !== value) onChange(local);
        }}
        onChange={(e) => setLocal(e.target.value)}
        className="focus-ring w-full resize-y rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-body placeholder:text-muted-foreground dark:bg-input/30"
      />
    </div>
  );
};
MultilineTextRenderer.type = multilineTextFieldType;

export { MultilineTextRenderer };
