import { useMemo } from "react";
import { TaskLaunch, type LaunchOptionInfo } from "../slots";

/** A draft card's launch-option values, keyed by option id. */
export type LaunchOptionValues = Record<string, unknown>;

/** Every registered option's seed value — what a fresh draft card starts from. */
export function useLaunchOptionDefaults(): LaunchOptionValues {
  const options = TaskLaunch.Option.useContributions();
  return useMemo(
    () => Object.fromEntries(options.map((o) => [o.id, o.def.defaultValue])),
    [options],
  );
}

/**
 * One option's value on a draft card. Presence, not `??`: `null` is a real
 * value (auto-start Off), and `??` would silently restore the default the user
 * just cleared.
 */
export function launchOptionValue(
  values: LaunchOptionValues,
  option: LaunchOptionInfo,
): unknown {
  return option.id in values ? values[option.id] : option.def.defaultValue;
}

/**
 * Drops values whose option is no longer registered. Asymmetric on purpose: a
 * stale localStorage draft must never block the user, while the server — which
 * cannot be stale — rejects an unknown id loudly.
 */
export function pickKnownOptions(
  values: LaunchOptionValues,
  known: readonly { id: string }[],
): LaunchOptionValues {
  const ids = new Set(known.map((o) => o.id));
  return Object.fromEntries(
    Object.entries(values).filter(([id]) => ids.has(id)),
  );
}
