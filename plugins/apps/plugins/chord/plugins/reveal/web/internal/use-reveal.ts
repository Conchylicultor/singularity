import { useConfig } from "@plugins/config_v2/web";
import {
  asRevealMode,
  type RevealMode,
} from "@plugins/apps/plugins/chord/plugins/reveal/core";
import { revealConfig } from "../../shared/config";

/**
 * How much of a chord the trainer is showing right now.
 *
 * Plain `useConfig`, not `useConfigResult`, and that is the documented-correct
 * choice here rather than a shortcut: the config document is hydrated into the
 * boot snapshot and its resource is resident, so the unknown window is normally
 * unreachable — and, more to the point, reveal is a **display preference**. Its
 * value makes no claim about the learner's data, so reading the default for a
 * frame cannot state something false about them; the worst case is a chord name
 * arriving a frame late. The rule this follows is written on `useConfig` itself
 * (`config_v2/web/internal/use-config.ts`): read the result-carrying form when
 * the value decides whether a surface says "nothing here", and the plain form
 * for a cosmetic one.
 *
 * The read is narrowed through `asRevealMode` because `enumField` types as
 * `string`.
 */
export function useReveal(): RevealMode {
  return asRevealMode(useConfig(revealConfig).mode);
}
