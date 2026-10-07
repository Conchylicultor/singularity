# automations

Things that file a task and launch its agent with nobody clicking anything.
Design: `research/2026-10-07-global-automations.md`; triggers, prompt and
Report investigations: `research/2026-10-07-global-automations-triggers-and-reports-v2.md`.

## Declaring one

```ts
// shared/config.ts of the plugin that knows what to watch (both runtimes)
export const depsUpgradesConfig = defineAutomationConfig("deps-upgrades", {
  enabled: true, push: "checks", trigger: "schedule",
  cadence: "week", weekday: "mon", at: "06:00",
  prompt: DEPS_UPGRADE_PROMPT, // `{{outdated}}` … `{{pushPolicy}}`
}, /* optional fields of its own */);

// server/internal/…
export const depsUpgradesAutomation = defineAutomation({
  id: "deps-upgrades", label: "Dependency upgrades", icon: symbol("upgrade"),
  description: "…", categoryId: DEPS_CATEGORY_ID,
  config: depsUpgradesConfig,
  triggers: { kinds: ["schedule"] },        // or { kinds: ["event", "schedule"], eventLabel }
  inProcess: "<why detect may hold a job slot for minutes>",
  sources: () => declaredUpdaters().map((u) => ({ id: u.id, label: u.id })),
  promptVariables: [{ name: "outdated", description: "…" }],
  detect: async ({ sources, settings, config, signal, partialFailure }) =>
    /* null, or */ ({ title, variables: { outdated }, sourceKeys, onFiled? }),
});
// server: contributions: [automationConfigRegistration(depsUpgradesConfig)], register: [depsUpgradesAutomation]
// web:    contributions: [...automationConfigContributions(depsUpgradesConfig)]
```

**Its config is one document per automation**, named by its id and stored under
this plugin's tree whichever plugin declares it:
`config/tasks/automations/<id>.origin.jsonc` is the committed default (the
prompt template included), the person's edits are their own override. Both
registrations are required (`config-v2:registrations-paired` catches a missing
half); the pane finds the document through `Automations.Config`. The common
fields are `enabled`, `push` (`never` | `safe` = only an uncontroversial change |
`checks`), `model` (one shared field object, so one `DynamicEnum.Options`),
`excludedSources`, `trigger` + the schedule (`cadence` hour/day/days/week/cron,
`at` local HH:MM, `everyDays`, `weekday`, `cron` UTC) + `settleMinutes`, and
`prompt`.

**The automation owns its job** (`automation.<id>`, singleton, `hold:
"minutes"`, main-only), so nothing can file around its settings.

- **Schedule.** The job's cron resolver reads the config (`automationCron`,
  `cadenceCron` converting the local time with the current UTC offset). A config
  change re-installs every schedule at once (`watchConfig` →
  `refreshJobSchedules`), no restart. Off, set to its event, or an invalid
  schedule ⇒ no cron (the catalog's `scheduleError` says why).
- **Event.** The declaring plugin calls the handle's `fire()` from the hot path
  that sees the event. While on and set to its event, it enqueues the singleton
  job with `runAt = min(now + settle, burstStart + 6 × settle)` — graphile's
  `replace` key mode moves the one pending row, so a burst is one run (re-queued
  at most every 30 s). Main only.

Each run:

1. Reads the config. Disabled ⇒ logs and stops.
2. Adopts `adoptLegacy`'s tasks (idempotent), then **dedupes**: a task this
   automation filed that is neither done nor dropped ⇒ stops. So an event
   storm while its agent works files nothing; the next run picks up what still
   qualifies.
3. Calls `detect` with only the INCLUDED sources, the settings and the whole
   config. `null` ⇒ stops. A source that fails calls `partialFailure(err)`.
4. Fills the prompt template with the filing's `variables` + `pushPolicy`
   (`PUSH_POLICY_TEXT`). A placeholder with no value throws — never a blank.
5. In ONE transaction: `createTask` (author `automation:<id>`), its category,
   its origin row. Then `onFiled(taskId)`, then `armTaskAutoStart` with the
   chosen model.

Every run logs one line to the `automations` log channel.

## The pane

Behavior (Enabled, Model, Push), Trigger (kind, schedule presets / cron, or the
settle wait), the `Automations.Section` contributions for this automation (a
render slot keyed by `automationId` — e.g. Report investigations' Which reports),
Sources, Prompt (the template; "Customized" when the user layer supplies it,
Reset to default through config_v2's `resetConfigField`; a template naming an
unknown variable is not saved), History.

## Where a task came from

`tasks_ext_origin` (entity extension of tasks, `core/internal/resources.ts`):
`{ taskId, automationId, sourceKeys, filedAt }`. A row PROVES an automation
filed the task; a task with none was filed by a person or an agent acting for
one. Served as the `automations.tasks` live collection — a window filterable
by `automationId` (newest first), and point reads by task id.

## Reads

- `automationsCatalog` (`automations.catalog`, external) — every registered
  automation with `enabled`, its trigger (supported kinds, current kind, words,
  `jobName`, installed `cron`, `scheduleError`), sources, prompt variables and
  `openTaskId`. Re-pushed when an automation's config changes, it files a task,
  or one of its tasks changes status.
- `automationTasks` — see above.
- `automationsRoute` / `automationDetailRoute` (`automation/:automationId`).

## The person's attention

A trigger on `tasks.statusChanged` (`automations.task-status`): when a task
with an origin row moves to `need_action` / `attempted` / `held`, a warning
lands in the bell, linking to the automation's detail pane.

<!-- AUTOGENERATED:BEGIN — do not edit; regenerated by `./singularity build` -->

## Plugin reference

- Description: Automations in the agent manager: the Automations sidebar entry and list (a DataView over the catalog — trigger in words, next run, on/off, open task), the detail pane (Run now through Background activity; Behavior — enabled, model, push policy; Trigger — schedule presets or custom cron, or the event and its settle wait; the sections an automation contributes through Automations.Section; its sources; the Prompt template with Customized / Reset to default; and the History of the tasks it filed), the `origin` Automation field in every task DataView, and automationConfigContributions — how a declaring plugin registers its automation's config document (Automations.Config). Automations registry: defineAutomation declares something that files a task and launches its agent on its own, and owns its job (automation.<id>) — its config document (defineAutomationConfig: enabled, push policy, model, excluded sources, trigger — a schedule re-installed live on change, or an event whose bursts settle into one run — and the prompt template), the one-open-task dedupe, the filled prompt, the filing (task + category + tasks_ext_origin row in one transaction) and the armed launch. Serves the automations.catalog value and the automations.tasks collection (the origin side-table), and notifies the bell when an automated task needs its person.
- Web:
  - Slots:
    - `Automations.Config`
    - `Automations.Section`
    - `automations.actions`
    - `automation-detail.actions`
  - Slot contributors:
    - `Automations.Config` ← `infra.deps.updates`
    - `Automations.Config` ← `tasks.reports-investigation`
    - `Automations.Section` ← `tasks.reports-investigation`
    - `automations.actions` ← `primitives.pane`
    - `automation-detail.actions` ← `primitives.pane`
  - Contributes:
    - `DynamicEnum.Options` "Model"
    - `Pane.Register` "automation-detail"
    - `Pane.Register` "automations"
    - `Shell.Sidebar` "Automations"
    - `Tasks.Fields` "origin" → `OriginField`
  - Uses: 53 symbols — full list in [REFERENCE.md](./REFERENCE.md)
    - `primitives/css/ui-kit` ×7
    - `primitives/live-state` ×5
    - `primitives/pane` ×5
    - `config_v2` ×3
    - `primitives/data-view` ×3
    - `tasks/task-status` ×3
    - `conversations/model-provider` ×2
    - `infra/background/catalog` ×2
    - `infra/endpoints` ×2
    - `primitives/css/control-panel` ×2
    - `fields/dynamic-enum/config.DynamicEnum`
    - `network/live.useLive`
    - `primitives/app-shell.opensPane`
    - `primitives/css/badge.Badge`
    - `primitives/css/fill.Fill`
    - `primitives/css/line.Line`
    - `primitives/css/placeholder.Placeholder`
    - `primitives/css/rigid.rigidClass`
    - `primitives/css/spacing.Stack`
    - `primitives/css/text.Text`
    - `primitives/editable-field.useEditableField`
    - `primitives/loading.Loading`
    - `primitives/relative-time.RelativeTime`
    - `primitives/slot-render.defineRenderSlot`
    - `shell.Shell`
    - `tasks/task-detail.taskDetailPane`
    - `tasks/task-list.Tasks`
    - `tasks.useTasksById`
    - `ui/icons.Icon`
  - Exports (values):
    - `automationConfigContributions`
    - `Automations`
- Server:
  - Contributes:
    - `resource.declare` "automations.catalog"
    - `resource.declare` "automations.tasks"
    - `resource.declare` "automations.tasks:groups"
    - `resource.declare` "automations.tasks:rows"
    - `trigger` "automations.task-status"
  - Uses: 21 symbols — full list in [REFERENCE.md](./REFERENCE.md)
    - `tasks/tasks-core` ×5
    - `config_v2` ×3
    - `database` ×2
    - `infra/jobs` ×2
    - `network/live` ×2
    - `infra/entity-extensions.defineExtension`
    - `infra/events.Trigger`
    - `infra/warmup.defineWarmup`
    - `primitives/log-channels.Log`
    - `shell/notifications.recordNotification`
    - `tasks/task-category.setTaskCategory`
    - `tasks.armTaskAutoStart`
  - DB schema: `plugins/tasks/plugins/automations/server/internal/tables.ts`
  - Entity extension of: `tasks/tasks-core` (table `tasks_ext_origin`)
  - Exports (types):
    - `Automation`
    - `AutomationDetectCtx`
    - `AutomationFiling`
    - `AutomationSpec`
  - Exports (values):
    - `automationConfigRegistration`
    - `defineAutomation`
  - Register: `defineJob('automations.task-status')`
  - Resources:
    - `automations.catalog` (push)
    - `automations.tasks` (keyed, window)
    - `automations.tasks:groups` (push)
    - `automations.tasks:rows` (keyed, point)
- Core:
  - Uses:
    - `config_v2.ConfigValues`
    - `config_v2.defineConfig`
    - `conversations/model-provider.DEFAULT_MODEL_CHOICE`
    - `conversations/model-provider.ModelChoiceSchema`
    - `conversations/model-provider.normalizeModelChoice`
    - `fields/bool/config.boolField`
    - `fields/date/config.dateField`
    - `fields/dynamic-enum/config.dynamicEnumField`
    - `fields/enum/config.enumField`
    - `fields/int/config.intField`
    - `fields/json/config.jsonField`
    - `fields/multiline-text/config.multilineTextField`
    - `fields/string-list/config.stringListField`
    - `fields/text/config.textField`
    - `framework/plugin-id.asPluginId`
    - `infra/entity-extensions.defineExtensionShape`
    - `network/live.liveCollection`
    - `network/live.liveValue`
    - `network/live/filter.liveText`
    - `primitives/pane.defineRoute`
  - Exports (types):
    - `AutomationConfigDefaults`
    - `AutomationConfigFields`
    - `AutomationEntry`
    - `AutomationSettings`
    - `AutomationSource`
    - `AutomationTaskRow`
    - `AutomationTrigger`
    - `Cadence`
    - `CadenceCron`
    - `PromptVariable`
    - `PushPolicy`
    - `RenderedPrompt`
    - `ScheduleSettings`
    - `TriggerKind`
    - `Weekday`
  - Exports (values):
    - `automationDetailRoute`
    - `AutomationEntrySchema`
    - `automationModelField`
    - `AUTOMATIONS_CONFIG_PLUGIN_ID`
    - `automationsCatalog`
    - `AutomationSettingsSchema`
    - `AutomationSourceSchema`
    - `automationsRoute`
    - `AutomationTaskRowSchema`
    - `automationTasks`
    - `AutomationTriggerSchema`
    - `CADENCE_LABELS`
    - `cadenceCron`
    - `CADENCES`
    - `cadenceWords`
    - `defineAutomationConfig`
    - `labeledOptions`
    - `PromptVariableSchema`
    - `PUSH_POLICIES`
    - `PUSH_POLICY_LABELS`
    - `PUSH_POLICY_TEXT`
    - `PUSH_POLICY_VARIABLE`
    - `readAutomationSettings`
    - `renderPrompt`
    - `ScheduleSettingsSchema`
    - `SETTLE_MAX_WAIT_FACTOR`
    - `taskOriginShape`
    - `templateVariables`
    - `TRIGGER_KIND_LABELS`
    - `TRIGGER_KINDS`
    - `unknownTemplateVariables`
    - `WEEKDAY_LABELS`
    - `WEEKDAYS`
- Cross-plugin:
  - Imported by:
    - `infra/deps/updates`
    - `tasks/reports-investigation`

<!-- AUTOGENERATED:END -->
