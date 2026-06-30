import { Button, Input } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { IconButton } from "@plugins/primitives/plugins/icon-button/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { MdAdd, MdClose } from "react-icons/md";

/**
 * Config form for the user-input step type. The executor suspends the workflow
 * and the execution trace renders one text input per `fields[]` entry under the
 * `prompt`. An empty `fields` list collects a single field named `"value"` (see
 * the execution component's `resolveFields`).
 *
 * Raw `onChange` on every change — the step inspector owns the debounce.
 */
interface UserInputField {
  name: string;
  label?: string;
}

interface UserInputConfigShape {
  prompt?: string;
  fields?: UserInputField[];
}

export function UserInputConfig({
  config,
  onChange,
}: {
  config: unknown;
  onChange: (config: unknown) => void;
}) {
  const current = (config ?? {}) as UserInputConfigShape;
  const fields = current.fields ?? [];

  function update(next: Partial<UserInputConfigShape>) {
    onChange({ ...current, ...next });
  }

  function updateField(index: number, patch: Partial<UserInputField>) {
    update({ fields: fields.map((f, i) => (i === index ? { ...f, ...patch } : f)) });
  }

  return (
    <Stack gap="sm">
      <Stack gap="2xs">
        <Text variant="caption" tone="muted">Prompt</Text>
        <textarea
          value={current.prompt ?? ""}
          rows={3}
          placeholder="Question shown to the person at runtime"
          onChange={(e) => update({ prompt: e.target.value })}
          aria-label="Prompt"
          className="text-body w-full resize-none bg-transparent outline-none placeholder:text-muted-foreground focus:ring-0"
        />
      </Stack>

      <Stack gap="2xs">
        <Text variant="caption" tone="muted">Fields</Text>
        {fields.length === 0 ? (
          <Text variant="caption" className="text-muted-foreground">
            No fields — a single field named &ldquo;value&rdquo; is collected by default.
          </Text>
        ) : (
          <Stack gap="xs">
            {fields.map((field, i) => (
              <Stack key={i} direction="row" align="center" gap="xs">
                <Input
                  value={field.name}
                  placeholder="name"
                  onChange={(e) => updateField(i, { name: e.target.value })}
                  aria-label={`Field ${i + 1} name`}
                />
                <Input
                  value={field.label ?? ""}
                  placeholder="label (optional)"
                  onChange={(e) => updateField(i, { label: e.target.value })}
                  aria-label={`Field ${i + 1} label`}
                />
                <IconButton
                  icon={MdClose}
                  label="Remove field"
                  variant="ghost"
                  onClick={() => update({ fields: fields.filter((_, j) => j !== i) })}
                />
              </Stack>
            ))}
          </Stack>
        )}
        <Stack as="div" direction="row" gap="none">
          <Button variant="outline" onClick={() => update({ fields: [...fields, { name: "" }] })}>
            <MdAdd /> Add field
          </Button>
        </Stack>
      </Stack>
    </Stack>
  );
}
