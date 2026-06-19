import { Button, Input } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { useContext, useEffect, useRef, useState } from "react";
import { MdCheck } from "react-icons/md";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
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
      <Stack gap="xs" className="py-md">
        {field.meta.label ? <Text as="label" variant="label">{field.meta.label}</Text> : null}
        {field.meta.description ? <Text as="p" variant="caption" className="text-muted-foreground">{field.meta.description}</Text> : null}
        <Stack direction="row" align="center" gap="sm">
          <Stack direction="row" align="center" gap="xs" className="text-success">
            <MdCheck className="size-3.5" />
            <Text variant="caption">Configured</Text>
          </Stack>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-sm text-caption"
            onClick={() => setEditing(true)}
          >
            Replace
          </Button>
        </Stack>
      </Stack>
    );
  }

  return (
    <Stack gap="xs" className="py-md">
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
    </Stack>
  );
};
SecretRenderer.type = secretFieldType;

export { SecretRenderer };
