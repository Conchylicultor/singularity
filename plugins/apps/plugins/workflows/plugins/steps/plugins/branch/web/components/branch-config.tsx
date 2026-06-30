import { Input } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";

/**
 * Config form for the branch step type. The branch executor reads `field` as a
 * dot-path into the previous step's output (see executor.ts `getByDotPath`) and
 * falls back to `defaultBranch` when that value is absent. The resolved value is
 * matched against this step's conditional route keys.
 *
 * Raw `onChange` on every keystroke — the step inspector owns the debounce.
 */
export function BranchConfig({
  config,
  onChange,
}: {
  config: unknown;
  onChange: (config: unknown) => void;
}) {
  const current = (config ?? {}) as { field?: string; defaultBranch?: string };

  return (
    <Stack gap="sm">
      <Stack gap="2xs">
        <Text variant="caption" tone="muted">Field path</Text>
        <Input
          value={current.field ?? ""}
          placeholder="e.g. result.status"
          onChange={(e) => onChange({ ...current, field: e.target.value })}
          aria-label="Field path"
        />
      </Stack>
      <Stack gap="2xs">
        <Text variant="caption" tone="muted">Default branch key</Text>
        <Input
          value={current.defaultBranch ?? ""}
          placeholder="e.g. default"
          onChange={(e) => onChange({ ...current, defaultBranch: e.target.value })}
          aria-label="Default branch key"
        />
      </Stack>
      <Text variant="caption" className="text-muted-foreground">
        The resolved value is matched against this step&apos;s conditional route keys; the default
        key is used when the field is absent.
      </Text>
    </Stack>
  );
}
