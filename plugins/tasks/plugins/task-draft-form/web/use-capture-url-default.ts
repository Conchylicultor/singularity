import { useActiveApp } from "@plugins/apps/web";

/**
 * Whether new draft cards should pre-check the "URL" capture toggle, read from
 * the app the form is currently rendered in. The page URL is useful task
 * context for most apps, so an app that declares nothing defaults to `true`;
 * an app opts out by setting `captureUrlByDefault: false` on its `Apps.App`
 * contribution (e.g. the agent manager). The form stays contributor-agnostic —
 * it never names a specific app.
 */
export function useCaptureUrlDefault(): boolean {
  return useActiveApp()?.captureUrlByDefault ?? true;
}
