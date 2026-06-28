import { useCurrentAppId } from "@plugins/apps-core/web";
import { useConfig } from "@plugins/config_v2/web";
import { taskDraftConfig } from "../shared/config";

/**
 * Whether new draft cards should pre-check the "URL" capture toggle. Read from
 * the task-draft config, scoped to the app the form is rendered in: most apps
 * keep the `true` default; an app opts out via a committed per-app config
 * override (`config/<…>/@app/<id>/config.jsonc`), e.g. the agent manager →
 * `false`. The form stays contributor-agnostic — config_v2 is app-agnostic and
 * the scope is threaded by app id, never by naming a specific app.
 */
export function useCaptureUrlDefault(): boolean {
  const appId = useCurrentAppId();
  const scopeId = appId ? `app:${appId}` : undefined;
  return useConfig(taskDraftConfig, { scopeId }).captureUrlByDefault;
}
