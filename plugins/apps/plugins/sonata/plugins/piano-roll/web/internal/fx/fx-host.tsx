/**
 * FxHost — mounts every PianoRollFx contribution, each behind its own config
 * gate and error boundary.
 *
 * Collection-consumer clean: this file reads only the GENERIC slot fields
 * (`id`, `config`, `component`) and never names a specific effect — adding or
 * removing an fx plugin changes the mounted set with zero edits here.
 *
 * Each contribution gets its own `FxGate` component so the `useConfig` hook
 * count stays stable per component regardless of how many effects exist, and
 * so a disabled effect costs exactly one reactive config read (the headless
 * component itself never mounts). `renderIsolated` wraps the effect in the
 * standard error-boundary middleware — one crashing effect never takes down
 * the roll or its siblings.
 */
import { useConfig } from "@plugins/config_v2/web";
import { renderIsolated } from "@plugins/primitives/plugins/slot-render/web";
import type { Contribution } from "@plugins/framework/plugins/web-sdk/core";
import { PianoRollFx, type FxContext } from "../../slots";

type FxContributionItem = ReturnType<typeof PianoRollFx.useContributions>[number];

export function FxHost({ fx }: { fx: FxContext }) {
  const effects = PianoRollFx.useContributions();
  return (
    <>
      {effects.map((c) => (
        <FxGate key={c.id} effect={c} fx={fx} />
      ))}
    </>
  );
}

function FxGate({ effect, fx }: { effect: FxContributionItem; fx: FxContext }) {
  const { enabled } = useConfig(effect.config);
  if (!enabled) return null;
  return (
    <>{renderIsolated(PianoRollFx.id, effect as unknown as Contribution, { fx })}</>
  );
}
