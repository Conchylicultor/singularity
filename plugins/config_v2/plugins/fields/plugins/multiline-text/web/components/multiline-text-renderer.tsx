import type { FieldRendererComponent } from "@plugins/config_v2/plugins/fields/web";
import {
  multilineTextFieldType,
  type MultilineTextFieldDef,
} from "../../core";
import { useEffect, useRef, useState } from "react";

function useLocalValue(incoming: string) {
  const [local, setLocal] = useState(incoming);
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setLocal(incoming);
  }, [incoming]);
  return {
    local,
    setLocal,
    focus: {
      onFocus: () => {
        focused.current = true;
      },
      onBlur: () => {
        focused.current = false;
      },
    },
  };
}

const MultilineTextRenderer: FieldRendererComponent<string> = ({
  field,
  value,
  onChange,
}) => {
  const { local, setLocal, focus } = useLocalValue(value);
  const rows = (field as MultilineTextFieldDef).rows ?? 4;
  return (
    <div className="flex flex-col gap-1.5 py-3">
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
        className="focus-ring w-full resize-y rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm leading-relaxed placeholder:text-muted-foreground dark:bg-input/30"
      />
    </div>
  );
};
MultilineTextRenderer.type = multilineTextFieldType;

export { MultilineTextRenderer };
