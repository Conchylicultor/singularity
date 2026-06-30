import { useState } from "react";
import { Button, Input } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { useEndpointMutation } from "@plugins/infra/plugins/endpoints/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import {
  submitStep,
  type WorkflowExecution,
  type WorkflowExecutionStep,
} from "@plugins/apps/plugins/workflows/plugins/engine/core";

interface UserInputField {
  name: string;
  label?: string;
}

interface UserInputConfigShape {
  prompt?: string;
  fields?: UserInputField[];
}

/**
 * Resolves the configured fields, dropping unnamed rows. When none remain we
 * collect a single `"value"` field — the same default the config form documents.
 */
function resolveFields(config: UserInputConfigShape): UserInputField[] {
  const fields = (config.fields ?? []).filter((f) => f.name.trim().length > 0);
  return fields.length > 0 ? fields : [{ name: "value" }];
}

/**
 * Future-aware relative formatter (`RelativeTime` only renders past times). Not
 * ticked on an interval — repo rules ban setInterval polling; the string is
 * derived once on render and refreshes on the next live-state push. Promote into
 * the `relative-time` primitive once a second consumer appears.
 */
function formatTimeUntil(date: Date): string {
  const ms = date.getTime() - Date.now();
  if (ms <= 0) return "Expiring…";
  const totalMinutes = Math.floor(ms / 60_000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `Expires in ${days}d ${hours}h`;
  if (hours > 0) return `Expires in ${hours}h ${minutes}m`;
  if (minutes > 0) return `Expires in ${minutes}m`;
  return `Expires in ${Math.floor(ms / 1000)}s`;
}

/**
 * Execution body for the user-input step. While the workflow is suspended it
 * renders the prompt + a form; submitting POSTs to the engine's submit endpoint,
 * which emits the `userInputSubmitted` event the executor is waiting on. Once the
 * workflow resumes, live-state pushes the completed step and we show the values.
 * The shared trace shell provides the chrome (icon, label, status, error).
 */
export function UserInputExecution({
  step,
  execution,
}: {
  step: WorkflowExecutionStep;
  execution: WorkflowExecution;
}) {
  const config = (step.config ?? {}) as UserInputConfigShape;

  if (step.status === "suspended") {
    return <SuspendedForm config={config} step={step} execution={execution} />;
  }
  if (step.status === "completed") {
    return <CollectedSummary output={step.output} />;
  }
  if (step.status === "expired") {
    return (
      <Text as="div" variant="caption" tone="muted">
        Expired — no response received.
      </Text>
    );
  }
  if (step.status === "cancelled") {
    return (
      <Text as="div" variant="caption" tone="muted">Cancelled.</Text>
    );
  }
  return null;
}

function SuspendedForm({
  config,
  step,
  execution,
}: {
  config: UserInputConfigShape;
  step: WorkflowExecutionStep;
  execution: WorkflowExecution;
}) {
  const fields = resolveFields(config);
  const [values, setValues] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const submit = useEndpointMutation(submitStep);

  // Returns the mutation promise so the shared Button auto-pends (spinner +
  // double-click guard) while in flight. Errors surface via the global toast.
  async function handleSubmit() {
    const data = Object.fromEntries(fields.map((f) => [f.name, values[f.name] ?? ""]));
    await submit.mutateAsync({
      params: { execId: execution.id, stepId: step.id },
      body: { data },
    });
    setSubmitted(true);
  }

  if (submitted) {
    return <Loading variant="spinner" label="Resuming…" />;
  }

  return (
    <Stack gap="sm">
      {config.prompt ? <Text as="div" variant="body">{config.prompt}</Text> : null}
      {step.expiresAt ? (
        <Text as="div" variant="caption" tone="muted">
          {formatTimeUntil(new Date(step.expiresAt))}
        </Text>
      ) : null}
      <Stack gap="xs">
        {fields.map((field) => (
          <Stack key={field.name} gap="2xs">
            <Text variant="caption" tone="muted">{field.label || field.name}</Text>
            <Input
              value={values[field.name] ?? ""}
              onChange={(e) =>
                setValues((v) => ({ ...v, [field.name]: e.target.value }))
              }
              aria-label={field.label || field.name}
            />
          </Stack>
        ))}
      </Stack>
      <Stack as="div" direction="row" justify="end" gap="none">
        <Button variant="default" onClick={handleSubmit}>Submit</Button>
      </Stack>
    </Stack>
  );
}

function CollectedSummary({ output }: { output: unknown }) {
  const entries =
    output && typeof output === "object" && !Array.isArray(output)
      ? Object.entries(output as Record<string, unknown>)
      : [];

  if (entries.length === 0) {
    return (
      <Text as="div" variant="caption" tone="muted">No input collected.</Text>
    );
  }

  return (
    <Stack gap="2xs">
      {entries.map(([key, value]) => (
        <Stack key={key} as="div" direction="row" gap="xs">
          <Text as="span" variant="caption" tone="muted">{key}</Text>
          <Text as="span" variant="caption">{String(value)}</Text>
        </Stack>
      ))}
    </Stack>
  );
}
