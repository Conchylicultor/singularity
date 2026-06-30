import { MODEL_TIERS } from "@plugins/conversations/plugins/model-provider/core";
import type { ModelTier } from "@plugins/conversations/plugins/model-provider/core";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { SegmentedControl } from "@plugins/primitives/plugins/css/plugins/toggle-chip/web";

/**
 * Config form for the llm-prompt step type. The executor interpolates `prompt`
 * against the previous step's output via `interpolate` (see executor.ts), runs a
 * one-shot Claude generation at the selected `tier` (optionally with `system`),
 * and emits `{ text }`. `{{ path }}` pulls a field from the input; `{{ . }}` is
 * the whole input.
 *
 * Raw `onChange` on every change — the step inspector owns the debounce.
 */
interface LlmPromptConfigShape {
  tier?: string;
  system?: string;
  prompt?: string;
}

const DEFAULT_TIER: ModelTier = "haiku";

const TIER_OPTIONS = MODEL_TIERS.map((tier) => ({
  id: tier,
  label: tier.charAt(0).toUpperCase() + tier.slice(1),
}));

export function LlmPromptConfig({
  config,
  onChange,
}: {
  config: unknown;
  onChange: (config: unknown) => void;
}) {
  const current = (config ?? {}) as LlmPromptConfigShape;
  const tier = (current.tier ?? DEFAULT_TIER) as ModelTier;

  return (
    <Stack gap="sm">
      <Stack gap="2xs">
        <Text variant="caption" tone="muted">Model</Text>
        <SegmentedControl<ModelTier>
          options={TIER_OPTIONS}
          value={tier}
          onChange={(id) => onChange({ ...current, tier: id })}
        />
      </Stack>
      <Stack gap="2xs">
        <Text variant="caption" tone="muted">System prompt</Text>
        <textarea
          value={current.system ?? ""}
          rows={2}
          placeholder="Optional system prompt"
          onChange={(e) => onChange({ ...current, system: e.target.value })}
          aria-label="System prompt"
          className="text-body w-full resize-none bg-transparent outline-none placeholder:text-muted-foreground focus:ring-0"
        />
      </Stack>
      <Stack gap="2xs">
        <Text variant="caption" tone="muted">Prompt</Text>
        <textarea
          value={current.prompt ?? ""}
          rows={3}
          placeholder="e.g. Summarize: {{ . }} — or use {{ field }} to pull a path"
          onChange={(e) => onChange({ ...current, prompt: e.target.value })}
          aria-label="Prompt"
          className="text-body w-full resize-none bg-transparent outline-none placeholder:text-muted-foreground focus:ring-0"
        />
      </Stack>
      <Text variant="caption" className="text-muted-foreground">
        {"{{ path }}"} interpolates a field from the previous step&apos;s output and {"{{ . }}"} is the whole input. The generated text is emitted as {"{ text }"}.
      </Text>
    </Stack>
  );
}
