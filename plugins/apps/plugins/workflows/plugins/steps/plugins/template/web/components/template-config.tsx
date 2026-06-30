import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { ToggleChip } from "@plugins/primitives/plugins/css/plugins/toggle-chip/web";

/**
 * Config form for the template step type. The executor renders `template`
 * against the previous step's output via `interpolate` (see executor.ts), then
 * emits the string — or, when `json` is on, `JSON.parse` of it — as the step
 * output. `{{ path }}` pulls a field from the input; `{{ . }}` is the whole input.
 *
 * Raw `onChange` on every change — the step inspector owns the debounce.
 */
interface TemplateConfigShape {
  template?: string;
  json?: boolean;
}

export function TemplateConfig({
  config,
  onChange,
}: {
  config: unknown;
  onChange: (config: unknown) => void;
}) {
  const current = (config ?? {}) as TemplateConfigShape;
  const json = current.json ?? false;

  return (
    <Stack gap="sm">
      <Stack gap="2xs">
        <Text variant="caption" tone="muted">Template</Text>
        <textarea
          value={current.template ?? ""}
          rows={3}
          placeholder="e.g. Hello {{ name }} — or {{ . }} for the whole input"
          onChange={(e) => onChange({ ...current, template: e.target.value })}
          aria-label="Template"
          className="text-body w-full resize-none bg-transparent outline-none placeholder:text-muted-foreground focus:ring-0"
        />
      </Stack>
      <Stack as="div" direction="row" gap="none">
        <ToggleChip active={json} onClick={() => onChange({ ...current, json: !json })}>
          Parse result as JSON
        </ToggleChip>
      </Stack>
      <Text variant="caption" className="text-muted-foreground">
        {"{{ path }}"} pulls a field from the previous step&apos;s output and {"{{ . }}"} is the whole input.
      </Text>
    </Stack>
  );
}
