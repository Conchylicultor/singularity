import type { ReactElement } from "react";
import { useSetConfig } from "@plugins/config_v2/web";
import {
  ControlPanel,
  ControlPanelPane,
} from "@plugins/primitives/plugins/css/plugins/control-panel/web";
import { ModelSelect } from "@plugins/conversations/plugins/model-provider/web";
import { PUSH_POLICIES, PUSH_POLICY_LABELS, type PushPolicy } from "../../core";
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
            settings.enabled
              ? "Files a task and starts its agent when it finds work."
              : "Files nothing until you turn it on."
          }
        >
          Enabled
        </ControlPanel.Row>
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
