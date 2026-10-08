import { useState } from "react";
import {
  Button,
  Input,
} from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import { ResourceErrorInline } from "@plugins/primitives/plugins/live-state/web";
import {
  Steps,
  Step,
  StepLink,
  StepDone,
  StepNote,
  StepCommand,
  type StepState,
} from "@plugins/primitives/plugins/setup-steps/web";
import {
  fetchEndpoint,
  getEndpointErrorMessage,
} from "@plugins/infra/plugins/endpoints/web";
import {
  BROWSER_KEY_PATTERN,
  clearMapsBrowserConfig,
  setMapsBrowserConfig,
} from "../../core";
import {
  useMapsBrowserConfig,
  type MapsBrowserConfigState,
} from "../internal/use-maps-browser-config";

const CONSOLE = "https://console.cloud.google.com";
/** The referrer every local checkout is served from, via the gateway. */
const LOCAL_REFERRER = "http://*.localhost:9000/*";

/**
 * Guided setup for the live map's public browser key (Maps JavaScript API).
 * Separate from the Places key wizard on purpose: that key is
 * server-only and must never be restricted to referrers, this one must be.
 */
export function LiveMapSetupPane() {
  const config = useMapsBrowserConfig();
  if (config.kind === "loading") {
    return <Loading variant="rows" count={4} className="p-lg max-w-lg" />;
  }
  if (config.kind === "error") {
    return (
      <ResourceErrorInline
        variant="block"
        subject="the live map setup state"
        error={config.error}
        refetch={config.refetch}
      />
    );
  }
  return <LiveMapSetupSteps config={config} />;
}

function LiveMapSetupSteps({
  config,
}: {
  config: Exclude<MapsBrowserConfigState, { kind: "loading" | "error" }>;
}) {
  const saved = config.kind === "set";
  // A draft only exists once the user types; until then the inputs show what is
  // stored (the key is public config, so showing it back is fine).
  const [keyDraft, setKeyDraft] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const keyValue = keyDraft ?? (saved ? config.browserKey : "");
  const trimmedKey = keyValue.trim();
  const keyValid = BROWSER_KEY_PATTERN.test(trimmedKey);
  const dirty = keyDraft !== null;

  const stepState: StepState = saved ? "done" : "active";

  async function handleSave() {
    setSaveError(null);
    try {
      await fetchEndpoint(
        setMapsBrowserConfig,
        {},
        { body: { browserKey: trimmedKey } },
      );
      setKeyDraft(null);
    } catch (err) {
      setSaveError(getEndpointErrorMessage(err));
    }
  }

  async function handleClear() {
    setSaveError(null);
    try {
      await fetchEndpoint(clearMapsBrowserConfig, {});
      setKeyDraft(null);
    } catch (err) {
      setSaveError(getEndpointErrorMessage(err));
    }
  }

  return (
    <Stack gap="xl" className="p-lg max-w-lg">
      <Stack gap="xs">
        {saved ? (
          <StepDone>Browser key saved</StepDone>
        ) : (
          <Text as="p" variant="caption" className="text-muted-foreground">
            No browser key on this machine yet. The live map is drawn in your
            browser by the Maps JavaScript API, which needs its own key — the
            Places key stays on the server and is never sent to a browser.
          </Text>
        )}
      </Stack>

      <Steps>
        <Step title="Enable the Maps JavaScript API" state={stepState}>
          <Stack gap="sm">
            <StepLink
              href={`${CONSOLE}/apis/library/maps-backend.googleapis.com`}
            />
            <StepNote>
              Use the project that already has billing linked — the one holding
              your Places key is fine.
            </StepNote>
          </Stack>
        </Step>

        <Step title="Create a browser key" state={stepState}>
          <Stack gap="sm">
            <StepLink href={`${CONSOLE}/apis/credentials`} />
            <StepNote>
              Create credentials → API key, then edit it. Under Application
              restrictions choose Websites and add this referrer:
            </StepNote>
            <StepCommand text={LOCAL_REFERRER} title="Copy referrer" />
            <StepNote>
              Also add every domain you publish pages on (for example
              https://your-domain/*). Under API restrictions, restrict the key
              to the Maps JavaScript API only. Do not reuse the Places key: it
              cannot carry a referrer restriction, and this key will be visible
              to anyone who can open your pages.
            </StepNote>
          </Stack>
        </Step>

        <Step title="Set a daily quota" state={stepState}>
          <Stack gap="sm">
            <StepLink
              href={`${CONSOLE}/apis/api/maps-backend.googleapis.com/quotas`}
            />
            <StepNote>
              Optional but recommended. A browser key is public by design, so a
              daily cap on map loads bounds what anyone could spend with it.
            </StepNote>
          </Stack>
        </Step>

        <Step title="Paste the key" state={stepState}>
          <Stack gap="sm">
            <Input
              placeholder="AIza…"
              value={keyValue}
              onChange={(e) => setKeyDraft(e.target.value)}
            />
            {trimmedKey && !keyValid ? (
              <Text as="p" variant="caption" className="text-destructive">
                Not a Google API key — it should start with AIza and be 39
                characters long.
              </Text>
            ) : null}
            <StepNote>
              Nothing is checked here: a referrer-restricted key can only be
              verified by a real page, so a wrong key shows up as an error on
              the map itself.
            </StepNote>
          </Stack>
        </Step>
      </Steps>

      <Stack gap="sm">
        <Stack direction="row" gap="sm">
          <Button
            variant="default"
            disabled={!keyValid || (saved && !dirty)}
            onClick={handleSave}
          >
            {saved ? "Save changes" : "Save"}
          </Button>
          {saved ? (
            <Button variant="outline" onClick={handleClear}>
              Remove browser key
            </Button>
          ) : null}
        </Stack>
        {saveError ? (
          <Text as="p" variant="caption" className="text-destructive">
            {saveError}
          </Text>
        ) : null}
      </Stack>
    </Stack>
  );
}
