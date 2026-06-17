import { Button, Input } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { useContext, useEffect, useRef, useState } from "react";
import { MdCheck } from "react-icons/md";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
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

  // Wait for meta before rendering — pending→isSet=false would wrongly show
  // the password input even when the secret is already configured.
  if (metaResult.pending) return null;
  const meta = metaResult.data[fieldKey];
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
      <div className="flex flex-col gap-xs py-md">
        {field.meta.label ? <Text as="label" variant="label">{field.meta.label}</Text> : null}
        {field.meta.description ? <Text as="p" variant="caption" className="text-muted-foreground">{field.meta.description}</Text> : null}
        <div className="flex items-center gap-sm">
          <Text variant="caption" className="flex items-center gap-xs text-success">
            <MdCheck className="size-3.5" />
            Configured
          </Text>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-sm text-caption"
            onClick={() => setEditing(true)}
          >
            Replace
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-xs py-md">
      {field.meta.label ? <Text as="label" variant="label">{field.meta.label}</Text> : null}
      {field.meta.description ? <Text as="p" variant="caption" className="text-muted-foreground">{field.meta.description}</Text> : null}
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
