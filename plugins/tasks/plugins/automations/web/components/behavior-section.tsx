import type { ReactElement } from "react";
import { useSetConfig } from "@plugins/config_v2/web";
import {
  ControlPanel,
  ControlPanelPane,
} from "@plugins/primitives/plugins/css/plugins/control-panel/web";
import { ModelSelect } from "@plugins/conversations/plugins/model-provider/web";
import type { ConfigDescriptor } from "@plugins/config_v2/core";
import {
  isLaunchAutomationConfig,
  MAX_LAUNCH_CONCURRENCY,
  PUSH_POLICIES,
  PUSH_POLICY_LABELS,
  type AutomationEntry,
  type LaunchAutomationConfigFields,
  type PushPolicy,
} from "../../core";
import { ChoiceSelect } from "./choice-select";
import type { AutomationSectionProps } from "./section-props";

const PUSH_DESCRIPTION: Record<PushPolicy, string> = {
  never: "The agent stops at a ready branch and flags it; you review and push.",
  safe: "Pushes a small, local fix that changes no behaviour and needs no design choice. Anything else waits for you, with a note saying what needs a decision.",
  checks: "The agent lands its work on main as soon as every check passes.",
};

/**
 * Whether it is on, what its agent may do with its work, and which model it
 * launches. Each control writes its one field of the automation's config.
 */
export function BehaviorSection({
  entry,
  descriptor,
  settings,
}: AutomationSectionProps): ReactElement {
  const set = useSetConfig(descriptor);
  return (
    <ControlPanelPane label={`${entry.label} behavior`}>
      <ControlPanel.Section label="Behavior">
        <ControlPanel.Row
          select="switch"
          checked={settings.enabled}
          onSelect={() => set("enabled", !settings.enabled)}
          description={
            entry.kind === "launch"
              ? settings.enabled
                ? `Starts agents on ready tasks, ${entry.concurrency} at a time.`
                : "Starts nothing until you turn it on. Agents already running finish."
              : settings.enabled
                ? "Files a task and starts its agent when it finds work."
                : "Files nothing until you turn it on."
          }
        >
          Enabled
        </ControlPanel.Row>
        {entry.kind === "launch" ? (
          <ConcurrencySetting entry={entry} descriptor={descriptor} />
        ) : null}
        <ControlPanel.Setting
          label="Model"
          hint="Used for every agent this automation launches."
          fit="field"
          control={
            <ModelSelect
              allowOff={false}
              value={settings.model}
              onChange={(model) => set("model", model)}
              ariaLabel="Model"
            />
          }
        />
      </ControlPanel.Section>
      <ControlPanel.Section label="Push">
        {PUSH_POLICIES.map((policy) => (
          <ControlPanel.Row
            key={policy}
            select="radio"
            checked={settings.push === policy}
            onSelect={() => set("push", policy)}
            description={PUSH_DESCRIPTION[policy]}
          >
            {PUSH_POLICY_LABELS[policy]}
          </ControlPanel.Row>
        ))}
      </ControlPanel.Section>
    </ControlPanelPane>
  );
}

const CONCURRENCY_OPTIONS = Array.from(
  { length: MAX_LAUNCH_CONCURRENCY },
  (_, i) => String(i + 1),
);

/**
 * How many of a launch-kind automation's agents run at once — and how many do
 * now. Lowering it below what runs stops nothing: the next one waits.
 */
function ConcurrencySetting({
  entry,
  descriptor,
}: {
  entry: Extract<AutomationEntry, { kind: "launch" }>;
  descriptor: AutomationSectionProps["descriptor"];
}): ReactElement {
  if (!isLaunchAutomationConfig(descriptor)) {
    throw new Error(
      `automation ${entry.id} is launch-kind but its config has no concurrency — declare it with defineLaunchAutomationConfig`,
    );
  }
  return <LaunchConcurrency entry={entry} descriptor={descriptor} />;
}

function LaunchConcurrency({
  entry,
  descriptor,
}: {
  entry: Extract<AutomationEntry, { kind: "launch" }>;
  descriptor: ConfigDescriptor<LaunchAutomationConfigFields>;
}): ReactElement {
  const set = useSetConfig(descriptor);
  return (
    <ControlPanel.Setting
      label="At once"
      hint={`${entry.runningTaskIds.length} running now. The next one starts when one finishes or reports.`}
      fit="field"
      control={
        <ChoiceSelect
          ariaLabel="Agents at once"
          value={String(entry.concurrency)}
          options={CONCURRENCY_OPTIONS.map((n) => ({ value: n, label: n }))}
          onChange={(n) => set("concurrency", Number(n))}
        />
      }
    />
  );
}

/**
 * Which of its declared sources take part. A source added later takes part
 * until it is excluded. Nothing for an automation that declares none.
 */
export function SourcesSection({
  entry,
  descriptor,
  settings,
}: AutomationSectionProps): ReactElement | null {
  const set = useSetConfig(descriptor);
  if (entry.sources.length === 0) return null;
  const excluded = new Set(settings.excludedSources);
  return (
    <ControlPanelPane label={`${entry.label} sources`}>
      <ControlPanel.Section
        label="Sources"
        description="Only the included sources are checked. A source added later is included until you exclude it."
      >
        {entry.sources.map((source) => (
          <ControlPanel.Row
            key={source.id}
            select="check"
            checked={!excluded.has(source.id)}
            onSelect={() =>
              set(
                "excludedSources",
                excluded.has(source.id)
                  ? settings.excludedSources.filter((id) => id !== source.id)
                  : [...settings.excludedSources, source.id],
              )
            }
          >
            {source.label}
          </ControlPanel.Row>
        ))}
      </ControlPanel.Section>
    </ControlPanelPane>
  );
}
