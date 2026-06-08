import { useContext, useEffect, useRef, useState } from "react";
import { MdCheck } from "react-icons/md";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { FieldRendererComponent } from "@plugins/config_v2/plugins/fields/web";
import { ConfigFieldContext } from "@plugins/config_v2/plugins/fields/web";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { secretFieldType } from "@plugins/fields/plugins/secret/core";
import { configV2SecretMetaResource } from "../../core";

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
      onFocus: () => { focused.current = true; },
      onBlur: () => { focused.current = false; },
    },
  };
}

const SecretRenderer: FieldRendererComponent<string> = ({ field, value, onChange }) => {
  const ctx = useContext(ConfigFieldContext);
  const [editing, setEditing] = useState(false);
  const { local, setLocal, focus } = useLocalValue(value);

  const metaResult = useResource(
    configV2SecretMetaResource,
    ctx ? { path: ctx.storePath } : { path: "" },
  );
  const fieldKey = ctx?.fieldKey ?? "";
  const meta = metaResult.pending ? null : metaResult.data[fieldKey];
  const isSet = meta?.set ?? false;

  const handleBlur = () => {
    focus.onBlur();
    if (local !== value) {
      onChange(local);
      setLocal("");
      setEditing(false);
    } else if (editing) {
      setEditing(false);
    }
  };

  if (isSet && !editing) {
    return (
      <div className="flex flex-col gap-1.5 py-3">
        {field.meta.label ? <label className="text-sm font-medium">{field.meta.label}</label> : null}
        {field.meta.description ? <p className="text-xs text-muted-foreground">{field.meta.description}</p> : null}
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1 text-xs text-success">
            <MdCheck className="size-3.5" />
            Configured
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs"
            onClick={() => setEditing(true)}
          >
            Replace
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5 py-3">
      {field.meta.label ? <label className="text-sm font-medium">{field.meta.label}</label> : null}
      {field.meta.description ? <p className="text-xs text-muted-foreground">{field.meta.description}</p> : null}
      <Input
        type="password"
        value={local}
        placeholder={field.meta.placeholder ?? "Enter secret…"}
        onFocus={focus.onFocus}
        onBlur={handleBlur}
        onChange={(e) => setLocal(e.target.value)}
      />
    </div>
  );
};
SecretRenderer.type = secretFieldType;

export { SecretRenderer };
