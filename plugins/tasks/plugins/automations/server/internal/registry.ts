import type { SymbolRef } from "@plugins/ui/plugins/icons/core";
import type { AutomationSettings, AutomationSource } from "../../core";
import type { AutomationFiling } from "./origin";

/** What `detect` is handed: only what the person let take part. */
export interface AutomationDetectCtx {
  /** The declared sources the settings do not exclude (all of them for an
   * automation that declares none: `[]`). */
  sources: AutomationSource[];
  /** The resolved settings this run uses (`autoPush` shapes the prompt). */
  settings: AutomationSettings;
  /** Aborted when the run overruns its job's budget — thread it into any wait. */
  signal: AbortSignal;
  /**
   * Record that one source failed while the others still answered. The run
   * files what the others found, then throws every recorded failure together,
   * so a partial outage neither hides nor blocks the rest.
   */
  partialFailure(err: unknown): void;
}

/**
 * An automation: something that files a task and launches its agent with
 * nobody clicking anything. Declared once, in the plugin that knows what to
 * watch; the registry owns everything else — the job, the settings, the
 * dedupe, the filing, the launch and the origin record.
 */
export interface AutomationSpec {
  /** Stable id: the config key, the job name's suffix, the origin rows' key. */
  id: string;
  /** What it is, for a person ("Dependency upgrades"). */
  label: string;
  icon: SymbolRef;
  /** What it watches and what it files, in one or two sentences. */
  description: string;
  /** The task category the filed tasks are stamped with. */
  categoryId: string;
  /**
   * When its job runs: a 5-field crontab (UTC), or a resolver read once at
   * worker startup that may return `null` to schedule nothing (a setting).
   * Main-only, like every schedule.
   */
  schedule: { cron: string | (() => string | null) };
  /**
   * Why `detect` may run in process (its job holds a slot for minutes): what
   * it does and what bounds it. Required by the jobs plugin for `minutes`.
   */
  inProcess: string;
  /** The things it watches that a person can include or exclude. Absent ⇒ none. */
  sources?: () => AutomationSource[];
  /** The settings an automation with no saved item runs on. */
  defaults: AutomationSettings;
  /**
   * Look for work. Runs only while the automation is enabled and has no open
   * task. `null` ⇒ nothing to do.
   */
  detect(ctx: AutomationDetectCtx): Promise<AutomationFiling | null>;
  /**
   * Transition only: the ids of tasks this automation filed before origins
   * were stored, so the dedupe and the history see them. Adopted at boot and
   * before every run, idempotently. Delete once no such task can be open.
   */
  adoptLegacy?: () => Promise<string[]>;
}

/** A registered automation and the job it owns. */
export interface RegisteredAutomation {
  spec: AutomationSpec;
  jobName: string;
}

// Filled during the register phase. Process state: the set is what this
// backend's composition declares.
const automations = new Map<string, RegisteredAutomation>();

export function addAutomation(entry: RegisteredAutomation): void {
  if (automations.has(entry.spec.id)) {
    throw new Error(
      `[automations] duplicate automation id "${entry.spec.id}" — each automation declares its own id`,
    );
  }
  automations.set(entry.spec.id, entry);
}

/** Every registered automation, in registration order. */
export function registeredAutomations(): RegisteredAutomation[] {
  return [...automations.values()];
}
