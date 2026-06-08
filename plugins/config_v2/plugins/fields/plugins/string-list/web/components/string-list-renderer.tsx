import type { FieldRendererComponent } from "@plugins/config_v2/plugins/fields/web";
import { stringListFieldType } from "../../core";
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

const StringListRenderer: FieldRendererComponent<string[]> = ({
  field,
  value,
  onChange,
}) => {
  const { local, setLocal, focus } = useLocalValue(value.join("\n"));
  const parse = (text: string) =>
    text
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
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
        <p className="text-xs text-muted-foreground">One item per line.</p>
      </div>
      <textarea
        value={local}
        rows={4}
        placeholder={field.meta.placeholder}
        onFocus={focus.onFocus}
        onBlur={() => {
          focus.onBlur();
          const next = parse(local);
          if (next.join("\n") !== value.join("\n")) onChange(next);
        }}
        onChange={(e) => setLocal(e.target.value)}
        className="focus-ring w-full resize-y rounded-lg border border-input bg-transparent px-2.5 py-1.5 font-mono text-sm leading-relaxed placeholder:text-muted-foreground dark:bg-input/30"
      />
    </div>
  );
};
StringListRenderer.type = stringListFieldType;

export { StringListRenderer };
