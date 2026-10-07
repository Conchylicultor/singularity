import { z } from "zod";
import type { ZodParser } from "@plugins/packages/plugins/zod-parser/core";
import type { SymbolRef } from "@plugins/ui/plugins/icons/core";
import { ModelChoiceSchema } from "@plugins/conversations/plugins/model-provider/core";

/**
 * How an automation behaves, as the person set it. The registry declares a
 * default for every field; a saved config item replaces them all at once
 * (`resolveAutomationSettings`).
 *
 * - `enabled` — Off / Auto-launch. Off, the automation's job still ticks but
 *   files nothing.
 * - `autoPush` — the filed task's agent may push by itself once its checks
 *   pass. Each automation decides what "checks pass" means in its prompt.
 * - `model` — the model the filed task's agent launches with.
 * - `excludedSources` — the ids of the sources that do not take part. A source
 *   added later takes part until it is excluded.
 */
export const AutomationSettingsSchema = z.object({
  enabled: z.boolean(),
  autoPush: z.boolean(),
  model: ModelChoiceSchema,
  excludedSources: z.array(z.string()),
});
export type AutomationSettings = z.infer<typeof AutomationSettingsSchema>;

/** One thing an automation watches (a dependency updater, …), which the person
 * can include or exclude. */
export const AutomationSourceSchema = z.object({
  id: z.string(),
  label: z.string(),
});
export type AutomationSource = z.infer<typeof AutomationSourceSchema>;

/**
 * When the automation runs. `jobName` is the job it owns — the key its entry
 * has in Background activity (`kind: "job"`), so Run now and the next run are
 * read there. `cron` is the schedule it resolved to, `null` when a setting
 * turned it off (it then runs only when started by hand).
 */
export const AutomationTriggerSchema = z.object({
  kind: z.literal("schedule"),
  jobName: z.string(),
  cron: z.string().nullable(),
});
export type AutomationTrigger = z.infer<typeof AutomationTriggerSchema>;

// The icon crosses the wire as the `SymbolRef` the server authored with
// `symbol("…")` — a tsc-checked literal the icon manifest collected. The check
// here is the shape; the name was checked where it was written.
const SymbolRefSchema: ZodParser<SymbolRef> = z.custom<SymbolRef>(
  (v) =>
    typeof v === "object" &&
    v !== null &&
    (v as { kind?: unknown }).kind === "symbol" &&
    typeof (v as { name?: unknown }).name === "string",
  "expected a symbol icon ref",
);

/**
 * One registered automation, as the Automations pane lists it. Declared in code
 * (`defineAutomation`), so the set is bounded by the composition.
 *
 * `openTaskId` is the task it filed that is neither done nor dropped — at most
 * one, since an automation never files beside an open task.
 */
export const AutomationEntrySchema = z.object({
  id: z.string(),
  label: z.string(),
  icon: SymbolRefSchema,
  description: z.string(),
  categoryId: z.string(),
  trigger: AutomationTriggerSchema,
  sources: z.array(AutomationSourceSchema),
  defaults: AutomationSettingsSchema,
  openTaskId: z.string().nullable(),
});
export type AutomationEntry = z.infer<typeof AutomationEntrySchema>;
