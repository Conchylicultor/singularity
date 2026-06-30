import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { ToggleChip } from "@plugins/primitives/plugins/css/plugins/toggle-chip/web";

/**
 * Config form for the set-value step type. The executor ignores its input and
 * emits this constant as the step output: a plain string, or — when `json` is on
 * — the result of `JSON.parse(value)` (see executor.ts).
 *
 * Raw `onChange` on every change — the step inspector owns the debounce.
 */
interface SetValueConfigShape {
  value?: string;
  json?: boolean;
}

export function SetValueConfig({
  config,
  onChange,
}: {
  config: unknown;
  onChange: (config: unknown) => void;
}) {
  const current = (config ?? {}) as SetValueConfigShape;
  const json = current.json ?? false;

  return (
    <Stack gap="sm">
      <Stack gap="2xs">
        <Text variant="caption" tone="muted">Value</Text>
        <textarea
          value={current.value ?? ""}
          rows={3}
          placeholder="Constant value emitted as this step's output"
          onChange={(e) => onChange({ ...current, value: e.target.value })}
          aria-label="Value"
          className="text-body w-full resize-none bg-transparent outline-none placeholder:text-muted-foreground focus:ring-0"
        />
      </Stack>
      <Stack as="div" direction="row" gap="none">
        <ToggleChip active={json} onClick={() => onChange({ ...current, json: !json })}>
          Parse as JSON
        </ToggleChip>
      </Stack>
      <Text variant="caption" className="text-muted-foreground">
        With JSON on, the value is parsed as JSON; off, it&apos;s emitted as a plain string.
      </Text>
    </Stack>
  );
}
