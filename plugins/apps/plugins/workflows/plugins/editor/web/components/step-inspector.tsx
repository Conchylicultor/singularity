import { useEffect, useRef, useState } from "react";
import { MdClose } from "react-icons/md";
import {
  Button,
  ControlSizeProvider,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Stack, Inset } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Surface } from "@plugins/primitives/plugins/css/plugins/surface/web";
import { Badge } from "@plugins/primitives/plugins/css/plugins/badge/web";
import { IconButton } from "@plugins/primitives/plugins/icon-button/web";
import { useEditableField } from "@plugins/primitives/plugins/editable-field/web";
import { PluginErrorBoundary } from "@plugins/primitives/plugins/error-boundary/web";
import { useEventCallback, useLatestRef } from "@plugins/primitives/plugins/latest-ref/web";
import { fetchEndpoint } from "@plugins/infra/plugins/endpoints/web";
import {
  updateDefinition,
  type DefinitionStep,
  type WorkflowDefinition,
} from "@plugins/apps/plugins/workflows/plugins/engine/core";
import {
  setEntry,
  deleteStep,
  setLabel,
  setNext,
  setRouteKey,
  setRouteTarget,
  addRoute,
  removeRoute,
  type StepPatch,
} from "../../shared/step-ops";
import { useStepTypeIndex } from "../internal/use-step-type-index";

const NONE = "__none__";
const CONFIG_DEBOUNCE_MS = 350;

type StepTypeIndex = ReturnType<typeof useStepTypeIndex>;

function stepLabel(step: DefinitionStep, stepTypes: StepTypeIndex): string {
  return step.label || stepTypes.get(step.pluginId)?.label || step.pluginId;
}

/** id → display-label map for every step other than `excludeId`. */
function otherStepItems(
  def: WorkflowDefinition,
  excludeId: string,
  stepTypes: StepTypeIndex,
): { id: string; label: string }[] {
  return Object.values(def.steps)
    .filter((s) => s.id !== excludeId)
    .map((s) => ({ id: s.id, label: stepLabel(s, stepTypes) }));
}

export function StepInspector({
  definitionId,
  def,
  step,
  stepTypes,
  onClose,
}: {
  definitionId: string;
  def: WorkflowDefinition;
  step: DefinitionStep;
  stepTypes: StepTypeIndex;
  onClose: () => void;
}) {
  const stepType = stepTypes.get(step.pluginId);
  const Icon = stepType?.icon;
  const isEntry = step.id === def.entryStepId;
  const ConfigComponent = stepType?.configComponent;

  const persist = useEventCallback((patch: StepPatch) =>
    fetchEndpoint(updateDefinition, { id: definitionId }, { body: patch }),
  );

  const labelField = useEditableField({
    value: step.label,
    onSave: async (v) => {
      await persist(setLabel(def, step.id, v));
    },
    label: "Step label",
  });

  // Config draft: local, seeded once from `step.config`. The parent remounts this
  // inspector via `key={step.id}` when the selection changes, so the draft resets
  // per step without an effect; live pushes for the *same* step re-render without
  // remounting, so a server echo can't clobber a mid-edit value. Saves are
  // debounced; the pending save flushes on step switch / unmount via the cleanup.
  const [draftConfig, setDraftConfig] = useState<Record<string, unknown>>(step.config);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<{ stepId: string; value: Record<string, unknown> } | null>(null);
  const defRef = useLatestRef(def);

  const saveConfig = useEventCallback(
    async (stepId: string, value: Record<string, unknown>) => {
      const d = defRef.current;
      const target = d.steps[stepId];
      if (!target) return;
      const steps = { ...d.steps, [stepId]: { ...target, config: value } };
      await fetchEndpoint(
        updateDefinition,
        { id: definitionId },
        { body: { steps, entryStepId: d.entryStepId } },
      );
    },
  );

  const flushConfig = useEventCallback(async () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const pending = pendingRef.current;
    pendingRef.current = null;
    if (pending) await saveConfig(pending.stepId, pending.value);
  });

  const onConfigChange = useEventCallback((next: unknown) => {
    const value = (next ?? {}) as Record<string, unknown>;
    setDraftConfig(value);
    pendingRef.current = { stepId: step.id, value };
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      void flushConfig();
    }, CONFIG_DEBOUNCE_MS);
  });

  // Flush the pending debounced save when this inspector unmounts (selection
  // change remounts via `key`, or the panel closes). Cleanup-only — no setState.
  useEffect(() => {
    return () => {
      void flushConfig();
    };
  }, [flushConfig]);

  async function handleDelete() {
    if (!confirm(`Delete step "${stepLabel(step, stepTypes)}"?`)) return;
    await persist(deleteStep(def, step.id));
    onClose();
  }

  const others = otherStepItems(def, step.id, stepTypes);
  const nextItems: Record<string, string> = {
    [NONE]: "— none (end) —",
    ...Object.fromEntries(others.map((s) => [s.id, s.label])),
  };
  const routes = step.nextStepMapping ? Object.entries(step.nextStepMapping) : [];

  return (
    <Surface level="raised">
      <Inset pad="md">
        <ControlSizeProvider size="sm">
          <Stack gap="md">
            {/* Header */}
            <Stack direction="row" align="center" justify="between" gap="sm">
              <Stack direction="row" align="center" gap="sm">
                {Icon ? <Icon className="size-4 text-muted-foreground" /> : null}
                <Text variant="label">{stepType?.label ?? step.pluginId}</Text>
              </Stack>
              <Stack direction="row" align="center" gap="sm">
                {isEntry ? (
                  <Badge colorClass="bg-info/10 text-info">Entry</Badge>
                ) : (
                  <Button variant="outline" onClick={() => void persist(setEntry(def, step.id))}>
                    Set as entry
                  </Button>
                )}
                <Button
                  variant="link"
                  className="text-destructive hover:text-destructive"
                  onClick={() => void handleDelete()}
                >
                  Delete
                </Button>
              </Stack>
            </Stack>

            {/* Label */}
            <Stack gap="2xs">
              <Text variant="caption" tone="muted">Label</Text>
              <input
                value={labelField.value}
                onChange={(e) => labelField.onChange(e.target.value)}
                onFocus={labelField.onFocus}
                onBlur={labelField.onBlur}
                placeholder="Step label"
                className="text-body w-full bg-transparent outline-none placeholder:text-muted-foreground focus:ring-0"
              />
            </Stack>

            {/* Configuration */}
            <Stack gap="2xs">
              <Text variant="caption" tone="muted">Configuration</Text>
              {ConfigComponent ? (
                <PluginErrorBoundary label="Step configuration">
                  <ConfigComponent config={draftConfig} onChange={onConfigChange} />
                </PluginErrorBoundary>
              ) : (
                <Text variant="caption" className="text-muted-foreground">
                  No configuration for this step type.
                </Text>
              )}
            </Stack>

            {/* Routing */}
            <Stack gap="sm">
              <Text variant="label">Routing</Text>

              <Stack gap="2xs">
                <Text variant="caption" tone="muted">Default next</Text>
                <Select
                  items={nextItems}
                  value={step.next ?? NONE}
                  onValueChange={(v: string | null) => {
                    if (!v) return;
                    void persist(setNext(def, step.id, v === NONE ? null : v));
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>— none (end) —</SelectItem>
                    {others.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Stack>

              <Stack gap="2xs">
                <Text variant="caption" tone="muted">Conditional routes</Text>
                <Text variant="caption" className="text-muted-foreground">
                  When this step resolves a value matching a route key, execution follows that route
                  instead of the default.
                </Text>
                {routes.map(([key, target]) => (
                  <RouteRow
                    key={key}
                    def={def}
                    step={step}
                    routeKey={key}
                    target={target}
                    others={others}
                    persist={persist}
                  />
                ))}
                <Button
                  variant="outline"
                  disabled={others.length === 0}
                  onClick={() => {
                    const first = others[0];
                    if (first) void persist(addRoute(def, step.id, first.id));
                  }}
                >
                  Add route
                </Button>
              </Stack>
            </Stack>
          </Stack>
        </ControlSizeProvider>
      </Inset>
    </Surface>
  );
}

/** A single conditional-route row: editable key, target step, remove. */
function RouteRow({
  def,
  step,
  routeKey,
  target,
  others,
  persist,
}: {
  def: WorkflowDefinition;
  step: DefinitionStep;
  routeKey: string;
  target: string;
  others: { id: string; label: string }[];
  persist: (patch: StepPatch) => Promise<unknown>;
}) {
  // Seeded once from `routeKey`; the parent keys each row by its route key, so a
  // rename remounts the row with the fresh value — no reset effect needed.
  const [keyDraft, setKeyDraft] = useState(routeKey);

  const targetItems: Record<string, string> = Object.fromEntries(
    others.map((s) => [s.id, s.label]),
  );

  function commitKey() {
    if (keyDraft === routeKey) return;
    const result = setRouteKey(def, step.id, routeKey, keyDraft);
    // The op returns the unchanged step map by reference when it refuses (empty
    // or duplicate key) — revert the local input in that case.
    if (result.steps === def.steps) {
      setKeyDraft(routeKey);
      return;
    }
    void persist(result);
  }

  return (
    <Stack direction="row" align="center" gap="xs">
      <Input
        value={keyDraft}
        onChange={(e) => setKeyDraft(e.target.value)}
        onBlur={commitKey}
        aria-label="Route key"
        className="w-24"
      />
      <Select
        items={targetItems}
        value={target}
        onValueChange={(v: string | null) => {
          if (!v) return;
          void persist(setRouteTarget(def, step.id, routeKey, v));
        }}
      >
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {others.map((s) => (
            <SelectItem key={s.id} value={s.id}>
              {s.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <IconButton
        icon={MdClose}
        label="Remove route"
        onClick={() => void persist(removeRoute(def, step.id, routeKey))}
      />
    </Stack>
  );
}
