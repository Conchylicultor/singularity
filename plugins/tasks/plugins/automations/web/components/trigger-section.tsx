import type { ReactElement } from "react";
import { useSetConfig } from "@plugins/config_v2/web";
import {
  ControlPanel,
  ControlPanelPane,
} from "@plugins/primitives/plugins/css/plugins/control-panel/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import {
  CADENCE_LABELS,
  CADENCES,
  labeledOptions,
  SETTLE_MAX_WAIT_FACTOR,
  TRIGGER_KIND_LABELS,
  WEEKDAY_LABELS,
  WEEKDAYS,
} from "../../core";
import { ChoiceSelect } from "./choice-select";
import { CommitInput } from "./commit-input";
import type { AutomationSectionProps } from "./section-props";

const SETTLE_CHOICES = [1, 2, 5, 10, 30, 60] as const;

/**
 * When it runs: a schedule (presets, or a custom cron) or — for an automation
 * that has an event — when the event fires, once a burst settles. The schedule
 * is installed as soon as it is saved; there is no restart to wait for.
 */
export function TriggerSection({
  entry,
  descriptor,
  settings,
}: AutomationSectionProps): ReactElement {
  const set = useSetConfig(descriptor);
  const { trigger } = entry;
  const schedule = settings.schedule;
  const settleOptions = SETTLE_CHOICES.includes(
    settings.settleMinutes as (typeof SETTLE_CHOICES)[number],
  )
    ? SETTLE_CHOICES
    : [...SETTLE_CHOICES, settings.settleMinutes].sort((a, b) => a - b);
  return (
    <ControlPanelPane label={`${entry.label} trigger`}>
      {trigger.kinds.length > 1 ? (
        <ControlPanel.Section label="Runs">
          {trigger.kinds.map((kind) => (
            <ControlPanel.Row
              key={kind}
              select="radio"
              checked={settings.trigger === kind}
              onSelect={() => set("trigger", kind)}
              description={
                kind === "event"
                  ? `${trigger.eventLabel ?? "On its event"}, once things settle.`
                  : "On a fixed schedule, covering whatever arrived since the last run."
              }
            >
              {TRIGGER_KIND_LABELS[kind]}
            </ControlPanel.Row>
          ))}
        </ControlPanel.Section>
      ) : null}

      {settings.trigger === "schedule" ? (
        <ControlPanel.Section
          label="Schedule"
          description={
            trigger.scheduleError !== null ? (
              <Text variant="caption" tone="destructive">
                Not scheduled: {trigger.scheduleError}.
              </Text>
            ) : schedule.cadence === "cron" ? (
              "A custom cron is read in UTC. Saved changes apply at once."
            ) : (
              "Times are this machine's local time. Saved changes apply at once."
            )
          }
        >
          <ControlPanel.Setting
            label="Repeats"
            fit="field"
            control={
              <ChoiceSelect
                ariaLabel="Repeats"
                value={schedule.cadence}
                options={labeledOptions(CADENCES, CADENCE_LABELS)}
                onChange={(cadence) => set("cadence", cadence)}
              />
            }
          />
          {schedule.cadence === "days" ? (
            <ControlPanel.Setting
              label="Every (days)"
              fit="field"
              control={
                <CommitInput
                  type="number"
                  ariaLabel="Every how many days"
                  value={String(schedule.everyDays)}
                  onCommit={(v) => {
                    const n = Number(v);
                    if (Number.isInteger(n) && n >= 2 && n <= 30) {
                      set("everyDays", n);
                    }
                  }}
                />
              }
            />
          ) : null}
          {schedule.cadence === "week" ? (
            <ControlPanel.Setting
              label="On"
              fit="field"
              control={
                <ChoiceSelect
                  ariaLabel="Weekday"
                  value={schedule.weekday}
                  options={labeledOptions(WEEKDAYS, WEEKDAY_LABELS)}
                  onChange={(weekday) => set("weekday", weekday)}
                />
              }
            />
          ) : null}
          {schedule.cadence === "day" ||
          schedule.cadence === "days" ||
          schedule.cadence === "week" ? (
            <ControlPanel.Setting
              label="At"
              fit="field"
              control={
                <CommitInput
                  type="time"
                  ariaLabel="Time of day"
                  value={schedule.at}
                  onCommit={(at) => set("at", at)}
                />
              }
            />
          ) : null}
          {schedule.cadence === "cron" ? (
            <ControlPanel.Setting
              label="Cron (UTC)"
              hint="minute hour day-of-month month weekday"
              fit="field"
              control={
                <CommitInput
                  ariaLabel="Cron"
                  className="font-mono"
                  value={schedule.cron}
                  onCommit={(cron) => set("cron", cron)}
                />
              }
            />
          ) : null}
        </ControlPanel.Section>
      ) : (
        <ControlPanel.Section
          label="When things settle"
          description={`A burst becomes one run: every new event restarts the wait, so the run starts ${settings.settleMinutes} min after the last one (at most ${settings.settleMinutes * SETTLE_MAX_WAIT_FACTOR} min after the first). ${
            entry.kind === "launch"
              ? "The run starts agents on what is ready, while a slot is free. A finished or reported agent frees its slot and starts the next one at once, without waiting for an event."
              : "The run files one task covering everything that qualifies, and while a task it filed is open, nothing new is filed — the next run picks up what still qualifies."
          }`}
        >
          <ControlPanel.Setting
            label="Wait"
            fit="field"
            control={
              <ChoiceSelect
                ariaLabel="Wait for things to settle"
                value={String(settings.settleMinutes)}
                options={settleOptions.map((m) => ({
                  value: String(m),
                  label: `${m} min`,
                }))}
                onChange={(v) => set("settleMinutes", Number(v))}
              />
            }
          />
        </ControlPanel.Section>
      )}
    </ControlPanelPane>
  );
}
