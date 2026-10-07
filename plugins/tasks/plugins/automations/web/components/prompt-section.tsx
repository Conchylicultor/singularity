import type { ReactElement } from "react";
import { configTiers } from "@plugins/config_v2/core";
import { useSetConfig } from "@plugins/config_v2/web";
import { resetConfigField } from "@plugins/config_v2/plugins/settings/core";
import { asPath } from "@plugins/framework/plugins/plugin-id/core";
import { useEndpointMutation } from "@plugins/infra/plugins/endpoints/web";
import { useLive } from "@plugins/network/plugins/live/web";
import { useEditableField } from "@plugins/primitives/plugins/editable-field/web";
import {
  ControlPanel,
  ControlPanelPane,
} from "@plugins/primitives/plugins/css/plugins/control-panel/web";
import { Badge } from "@plugins/primitives/plugins/css/plugins/badge/web";
import { Button } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import {
  AUTOMATIONS_CONFIG_PLUGIN_ID,
  PUSH_POLICY_VARIABLE,
  templateVariables,
  unknownTemplateVariables,
} from "../../core";
import type { AutomationSectionProps } from "./section-props";

/**
 * The filed task's description, as a template: the repo default is committed in
 * `config/tasks/automations/<id>.origin.jsonc`, and an edit here is the
 * person's own override of it ("Customized", with Reset to default). A template
 * that names a variable the automation does not fill is never saved.
 */
export function PromptSection({
  entry,
  descriptor,
  settings,
}: AutomationSectionProps): ReactElement {
  const set = useSetConfig(descriptor);
  const storePath = `${asPath(AUTOMATIONS_CONFIG_PLUGIN_ID)}/${descriptor.name}.jsonc`;
  const tiers = useLive(configTiers, { path: storePath });
  const reset = useEndpointMutation(resetConfigField);
  const draft = useEditableField({
    value: settings.prompt,
    label: "Prompt",
    onSave: (next) => {
      if (unknownTemplateVariables(next, entry.promptVariables).length > 0) {
        return;
      }
      set("prompt", next);
    },
  });
  const unknown = unknownTemplateVariables(draft.value, entry.promptVariables);
  const used = templateVariables(draft.value);
  const customized = tiers.status === "ready" && tiers.data.prompt === "user";
  return (
    <ControlPanelPane label={`${entry.label} prompt`}>
      <ControlPanel.Section
        label="Prompt"
        description={`The task the agent is given. Default: config/tasks/automations/${descriptor.name}.origin.jsonc in the repo; editing saves your own copy.`}
      >
        <ControlPanel.Block
          label="Template"
          status={customized ? <Badge variant="info">Customized</Badge> : null}
          actions={
            customized ? (
              <Button
                variant="ghost"
                onClick={() =>
                  reset.mutate({ body: { storePath, key: "prompt" } })
                }
              >
                Reset to default
              </Button>
            ) : null
          }
        >
          <Stack gap="sm">
            <textarea
              value={draft.value}
              rows={16}
              spellCheck={false}
              aria-label="Prompt template"
              onFocus={draft.onFocus}
              onBlur={draft.onBlur}
              onChange={(e) => draft.onChange(e.target.value)}
              className="focus-border w-full resize-y rounded-lg border border-input bg-transparent px-sm py-xs font-mono text-caption dark:bg-input/30"
            />
            {unknown.length > 0 ? (
              <Text variant="caption" tone="destructive">
                {`Not saved: ${unknown.map((n) => `{{${n}}}`).join(", ")} is not a variable this automation fills.`}
              </Text>
            ) : null}
            {!used.includes(PUSH_POLICY_VARIABLE.name) ? (
              <Text variant="caption" tone="destructive">
                {`Without {{${PUSH_POLICY_VARIABLE.name}}} the agent is never told the Push setting, so it never pushes.`}
              </Text>
            ) : null}
            <Stack gap="2xs">
              {entry.promptVariables.map((v) => (
                <Text key={v.name} variant="caption" tone="muted">
                  <Text as="span" variant="code">{`{{${v.name}}}`}</Text>
                  {` — ${v.description}`}
                </Text>
              ))}
            </Stack>
          </Stack>
        </ControlPanel.Block>
      </ControlPanel.Section>
    </ControlPanelPane>
  );
}
