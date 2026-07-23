import { Button, Input } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { useState } from "react";
import {
  useAccountStatus,
  startConnectFlow,
  currentWorktreeName,
} from "@plugins/auth/web";
import { fetchEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { setConfigField } from "@plugins/config_v2/core";
import { useConfigRegistrations } from "@plugins/config_v2/web";
import { configV2SecretMetaResource } from "@plugins/fields/plugins/secret/plugins/config/core";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import {
  Steps,
  Step,
  StepLink,
  StepDone,
  StepNote,
  StepCommand,
} from "@plugins/primitives/plugins/setup-steps/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";

const REDIRECT_URI = "http://localhost:9000/api/auth/callback/google";

function extractProjectId(raw: string): string {
  const match = raw.match(/[?&]project=([^&#]+)/);
  return match?.[1] ?? raw.trim();
}

export function GoogleSetupPane() {
  const [projectId, setProjectId] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [saving, setSaving] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const registrations = useConfigRegistrations();
  const reg = registrations.find((r) => r.descriptor.name === "auth-google");
  const storePath = reg?.storePath ?? "";
  const metaResult = useResource(configV2SecretMetaResource, { path: storePath });
  const status = useAccountStatus("google");
  if (metaResult.pending) return <Loading />;
  const secretMeta = metaResult.data;
  const credentialsSaved = !!secretMeta.clientId?.set && !!secretMeta.clientSecret?.set;
  const connected = status?.connected;

  function handleProjectInput(raw: string) {
    setProjectId(extractProjectId(raw));
  }

  async function handleSaveCredentials() {
    if (!storePath) return;
    setSaving(true);
    try {
      if (clientId)
        await fetchEndpoint(setConfigField, {}, { body: { storePath, key: "clientId", value: clientId } });
      if (clientSecret)
        await fetchEndpoint(setConfigField, {}, { body: { storePath, key: "clientSecret", value: clientSecret } });
      setClientId("");
      setClientSecret("");
    } finally {
      setSaving(false);
    }
  }

  async function handleConnect() {
    setConnecting(true);
    setConnectError(null);
    try {
      const result = await startConnectFlow({
        providerId: "google",
        worktree: currentWorktreeName(),
      });
      if (!result.ok && result.message && result.message !== "cancelled") {
        setConnectError(result.message);
      }
    } catch (err) {
      setConnectError(err instanceof Error ? err.message : String(err));
    } finally {
      setConnecting(false);
    }
  }

  const hasProject = projectId.length > 0;

  return (
    <Stack gap="xl" className="p-lg max-w-lg">
      <div>
        <Text as="label" variant="label">GCP Project ID</Text>
        {/* eslint-disable-next-line spacing/no-adhoc-spacing -- single-edge offset under label, no flex parent to own a gap */}
        <Input className="mt-1"
          placeholder="my-project-123"
          value={projectId}
          onChange={(e) => handleProjectInput(e.target.value)}
        />
        {/* eslint-disable-next-line spacing/no-adhoc-spacing -- single-edge offset under input, no flex parent to own a gap */}
        <Text as="p" variant="caption" className="mt-1 text-muted-foreground">
          Paste any GCP console URL, or type your project ID
        </Text>
      </div>

      <Steps>
        <Step
          title="Select or create a GCP project"
          state={hasProject ? "done" : "active"}
        >
          <StepLink href="https://console.cloud.google.com/projectcreate" />
        </Step>

        <Step
          title="Enable Google Drive API"
          state={hasProject ? "active" : "upcoming"}
        >
          <StepLink
            href={`https://console.cloud.google.com/apis/library/drive.googleapis.com?project=${projectId}`}
          />
        </Step>

        <Step
          title="Set up OAuth consent screen"
          state={hasProject ? "active" : "upcoming"}
        >
          <StepLink
            href={`https://console.cloud.google.com/auth/overview?project=${projectId}`}
          />
        </Step>

        <Step
          title="Create OAuth 2.0 credentials"
          state={hasProject ? "active" : "upcoming"}
        >
          <Stack gap="sm">
            <StepLink
              href={`https://console.cloud.google.com/auth/clients/create?project=${projectId}`}
            />
            <StepNote>
              Application type: <span className="font-medium">Desktop app</span>
            </StepNote>
            <StepCommand text={REDIRECT_URI} title="Copy redirect URI" />
            <StepNote>Add this as the Authorized redirect URI</StepNote>
          </Stack>
        </Step>

        <Step
          title="Enter credentials"
          state={credentialsSaved ? "done" : "active"}
        >
          <Stack gap="sm">
            {credentialsSaved ? (
              <StepDone>Credentials configured</StepDone>
            ) : (
              <>
                <Input
                  type="password"
                  placeholder="Client ID"
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                />
                <Input
                  type="password"
                  placeholder="Client Secret"
                  value={clientSecret}
                  onChange={(e) => setClientSecret(e.target.value)}
                />
                <Button
                  variant="default"
                  loading={saving}
                  disabled={!clientId && !clientSecret}
                  onClick={handleSaveCredentials}
                >
                  Save
                </Button>
              </>
            )}
          </Stack>
        </Step>

        <Step
          title="Connect your account"
          state={connected ? "done" : credentialsSaved ? "active" : "upcoming"}
        >
          <Stack gap="sm">
            {connected ? (
              <StepDone>
                Connected
                {status.identity?.email ? ` (${status.identity.email})` : ""}
              </StepDone>
            ) : (
              <>
                <Button
                  variant="default"
                  disabled={connecting}
                  onClick={handleConnect}
                >
                  {connecting ? "Connecting…" : "Connect with Google"}
                </Button>
                {connectError ? (
                  <Text as="p" variant="caption" className="text-destructive">{connectError}</Text>
                ) : null}
              </>
            )}
          </Stack>
        </Step>
      </Steps>
    </Stack>
  );
}
